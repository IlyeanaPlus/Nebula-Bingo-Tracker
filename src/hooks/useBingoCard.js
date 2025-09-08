// src/hooks/useBingoCard.js
// Legacy flow with Tuner step: Fill → file picker → **Grid Tuner** → crops → CLIP analyze → 25 results.
// Exposes tuner state & callbacks so your existing Tuner modal can bind directly.

import { useRef, useState } from "react";
import { computeCrops25, fileToImage, loadFractions, saveFractions } from "../utils/image";
import { getSpriteIndex } from "../utils/sprites";
import { dataUrlToImage } from "../utils/clip";
import { getClipSession, embedImage } from "../utils/clipSession";
import { findBestMatch } from "../utils/matchers";

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));

  // Persisted fractions (used for actual crop/analysis)
  const [fractions, setFractions] = useState(loadFractions());

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // === Grid Tuner state ===
  const [showTuner, setShowTuner] = useState(false);
  const [tunerImage, setTunerImage] = useState(null);          // <img> for preview
  const [tunerFractions, setTunerFractions] = useState(
    fractions ?? { rows: Array(5).fill(1/5), cols: Array(5).fill(1/5) }
  );
  const [tunerCrops, setTunerCrops] = useState([]);            // 25 preview crops (dataURLs)
  const pendingFileRef = useRef(null);                         // file awaiting confirm

  // Hidden file input for "Fill"
  const fileInputRef = useRef(null);

  // ----- ANALYZE (runs AFTER tuner confirm) -----
  async function analyzeScreenshot(file) {
    if (!file) return;
    setAnalyzing(true);
    setProgress(0);
    console.log('[useBingoCard] analyze start. file=', file?.name || file?.type || 'blob');

    try {
      const img = await fileToImage(file);
      console.log('[useBingoCard] image loaded:', img.naturalWidth, 'x', img.naturalHeight);

      const crops = computeCrops25(img, fractions);
      console.log('[useBingoCard] crops:', crops.length);

      console.log('[useBingoCard] init CLIP session…');
      const session = await getClipSession();
      console.log('[useBingoCard] session ready.');

      console.log('[useBingoCard] load sprite index…');
      const index = await getSpriteIndex();
      console.log('[useBingoCard] index ready. refs=', index?.meta?.length, 'vecs=', index?.vectors?.length);

      const newResults = [];
      for (let i = 0; i < crops.length; i++) {
        try {
          if (i % 5 === 0) console.log(`[useBingoCard] embedding crop ${i + 1}/${crops.length}`);
          const cropImg = await dataUrlToImage(crops[i]);
          const tensor = await embedImage(cropImg, session);
          const best = findBestMatch(tensor.data, index);
          newResults.push(best);
        } catch (e) {
          console.warn(`[useBingoCard] match failed for cell ${i}`, e);
          newResults.push(null);
        }
        setProgress(Math.round(((i + 1) / crops.length) * 100));
      }

      console.log('[useBingoCard] done. filled results=', newResults.filter(Boolean).length);
      setResults(newResults);
    } catch (e) {
      console.error('[useBingoCard] analyze fatal error:', e);
      setResults(Array(25).fill(null));
    } finally {
      setAnalyzing(false);
    }
  }


  // ----- TUNER FLOW -----
  async function openTunerForFile(file) {
    const img = await fileToImage(file);
    pendingFileRef.current = file;
    const init = fractions ?? { rows: Array(5).fill(1/5), cols: Array(5).fill(1/5) };
    setTunerImage(img);
    setTunerFractions(init);
    setTunerCrops(computeCrops25(img, init));
    setShowTuner(true);
  }

  // UI calls this as the user drags handles / adjusts fractions.
  function updateTunerFractions(nextFractions) {
    setTunerFractions(nextFractions);
    if (tunerImage) {
      try {
        setTunerCrops(computeCrops25(tunerImage, nextFractions));
      } catch {}
    }
  }

  // Apply tuner → persist fractions → close tuner → analyze
  async function confirmTuner(nextFractions) {
    const f = nextFractions ?? tunerFractions;
    saveFractions(f);
    setFractions(f);
    setShowTuner(false);
    const file = pendingFileRef.current;
    pendingFileRef.current = null;
    setTunerImage(null);
    setTunerCrops([]);
    if (file) await analyzeScreenshot(file);
  }

  // Cancel tuner without analyzing
  function cancelTuner() {
    setShowTuner(false);
    pendingFileRef.current = null;
    setTunerImage(null);
    setTunerCrops([]);
  }

  // ----- FILL BUTTON → file picker → open tuner -----

  function fillCard(ev) {
    // Keep the user gesture: do everything sync in the same call stack
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();

    // 1) Modern API: showOpenFilePicker (best compatibility with gesture gating)
    const canUsePicker = typeof window.showOpenFilePicker === "function";
    if (canUsePicker) {
      // Use synchronous .then chain instead of async/await to keep the gesture intact
      window.showOpenFilePicker({
        types: [{ description: "Images", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".bmp"] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      })
      .then(handles => handles?.[0]?.getFile())
      .then(file => { if (file) return openTunerForFile(file); })
      .catch(() => {/* user canceled or unsupported — silently ignore */});
      return;
    }

    // 2) Fallback: hidden <input type="file">
    let input = fileInputRef.current;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.top = "0";
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    // Fresh listener per click, kept sync with the gesture
    const handler = (e) => {
      const file = e.target.files && e.target.files[0];
      // Clear value so same file can be re-picked later
      e.target.value = "";
      input.removeEventListener("change", handler);
      if (file) {
        // Open tuner before analyze (legacy flow)
        openTunerForFile(file).catch(err => console.warn("openTunerForFile failed:", err));
      }
    };

    input.addEventListener("change", handler, { once: true });
    // Important: trigger click *synchronously* inside the user gesture
    input.click();
  }


  // ----- Misc helpers -----
  function bindFileInputRef(el) {
    fileInputRef.current = el || null;
    if (el) { el.type = "file"; el.accept = "image/*"; el.style.display = "none"; }
  }

  function toggleChecked(idx) {
    setChecked((prev) => {
      const next = prev.slice();
      next[idx] = !next[idx];
      return next;
    });
  }

  function clearResults() {
    setResults(Array(25).fill(null));
    setChecked(Array(25).fill(false));
  }

  // Expose everything needed for the legacy UI, including tuner controls
  return {
    // state
    title, setTitle, renaming, setRenaming,
    results, checked, fractions, setFractions,
    analyzing, progress,

    // tuner
    showTuner, setShowTuner,
    tunerImage, tunerCrops, tunerFractions,
    updateTunerFractions, confirmTuner, cancelTuner,

    // actions
    analyzeScreenshot,
    fillCard,
    bindFileInputRef,
    toggleChecked,
    clearResults,
    onRemove,
  };
}