// src/hooks/useBingoCard.js
// Legacy flow w/ Tuner: Fill → file picker → Grid Tuner → crops → CLIP analyze → 25 results.
// Also restores robust "click title → rename" behavior.

import { useEffect, useRef, useState } from "react";
import { computeCrops25, fileToImage, loadFractions, saveFractions } from "../utils/image";
import { getSpriteIndex } from "../utils/sprites";
import { dataUrlToImage } from "../utils/clip";
import { getClipSession, embedImage } from "../utils/clipSession";
import { findBestMatch } from "../utils/matchers";

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  // ---------- Title / rename ----------
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const prevTitleRef = useRef(title);

  // Begin rename on title click
  function startRenaming(ev) {
    if (ev?.preventDefault) ev.preventDefault();
    prevTitleRef.current = title;
    setRenaming(true);
  }

  // Commit rename (Enter or blur)
  function commitRenaming(nextTitle) {
    const newTitle = (typeof nextTitle === "string" ? nextTitle : title).trim();
    const finalTitle = newTitle.length ? newTitle : prevTitleRef.current;
    setTitle(finalTitle);
    setRenaming(false);
    if (onChange) {
      try {
        onChange({ ...card, title: finalTitle });
      } catch (e) {
        console.warn("[useBingoCard] onChange(title) failed:", e);
      }
    }
  }

  // Cancel (Esc or click-away)
  function cancelRenaming() {
    setTitle(prevTitleRef.current);
    setRenaming(false);
  }

  // Props helpers you can spread onto your title input/element
  const titleEditing = {
    renaming,
    title,
    // For a static <h*> title:
    onTitleClick: startRenaming,
    // For an <input> shown only while renaming:
    onTitleInputChange: (e) => setTitle(e.target.value),
    onTitleInputKeyDown: (e) => {
      if (e.key === "Enter") commitRenaming(e.currentTarget.value);
      else if (e.key === "Escape") cancelRenaming();
    },
    onTitleInputBlur: (e) => commitRenaming(e.currentTarget.value),
  };

  // ---------- Results / checks ----------
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));

  // Persisted fractions (used for actual crop/analysis)
  const [fractions, setFractions] = useState(loadFractions());

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // ---------- Grid Tuner state ----------
  const [showTuner, setShowTuner] = useState(false);
  const [tunerImage, setTunerImage] = useState(null); // <img> for preview
  const [tunerFractions, setTunerFractions] = useState(
    fractions ?? { rows: Array(5).fill(1 / 5), cols: Array(5).fill(1 / 5) }
  );
  const [tunerCrops, setTunerCrops] = useState([]); // 25 preview crops (dataURLs)
  const pendingFileRef = useRef(null); // file awaiting confirm

  // Hidden file input for "Fill"
  const fileInputRef = useRef(null);

  // ---------- ANALYZE (runs AFTER tuner confirm) ----------
  async function analyzeScreenshot(file) {
    if (!file) return;
    setAnalyzing(true);
    setProgress(0);
    try {
      const img = await fileToImage(file);
      const crops = computeCrops25(img, fractions); // use persisted, confirmed fractions

      // Load CLIP and index (robust to missing precomputed files)
      let session, index;
      try {
        session = await getClipSession();
      } catch (e) {
        console.error("[useBingoCard] Failed to init CLIP session:", e);
        setResults(Array(25).fill(null));
        return;
      }
      try {
        index = await getSpriteIndex();
      } catch (e) {
        console.warn("[useBingoCard] No sprite index available (sprite_index_clip.json / fallbacks missing).", e);
        setResults(Array(25).fill(null));
        return;
      }

      const newResults = [];
      for (let i = 0; i < crops.length; i++) {
        try {
          const cropImg = await dataUrlToImage(crops[i]);
          const tensor = await embedImage(cropImg, session);
          const best = findBestMatch(tensor.data, index); // { score, idx, key, name, url, ref }
          newResults.push(best);
        } catch (e) {
          console.warn(`[useBingoCard] match failed for cell ${i}`, e);
          newResults.push(null);
        }
        setProgress(Math.round(((i + 1) / crops.length) * 100));
      }
      setResults(newResults);
    } finally {
      setAnalyzing(false);
    }
  }

  // ---------- TUNER FLOW ----------
  async function openTunerForFile(file) {
    const img = await fileToImage(file);
    pendingFileRef.current = file;
    const init = fractions ?? { rows: Array(5).fill(1 / 5), cols: Array(5).fill(1 / 5) };
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

  // ---------- FILL BUTTON → file picker → open tuner ----------
  function fillCard(ev) {
    // Keep the user gesture: do everything sync in the same call stack
    if (ev?.preventDefault) ev.preventDefault();
    if (ev?.stopPropagation) ev.stopPropagation();

    // Modern API (if available on the platform)
    if (typeof window.showOpenFilePicker === "function") {
      window
        .showOpenFilePicker({
          types: [
            {
              description: "Images",
              accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".bmp"] },
            },
          ],
          excludeAcceptAllOption: false,
          multiple: false,
        })
        .then((handles) => handles?.[0]?.getFile())
        .then((file) => {
          if (file) return openTunerForFile(file);
        })
        .catch(() => {
          /* user canceled or unsupported — silently ignore */
        });
      return;
    }

    // Fallback: hidden <input type="file"> (must exist or we create it)
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

    const handler = (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ""; // allow re-pick of same file later
      input.removeEventListener("change", handler);
      if (file) {
        openTunerForFile(file).catch((err) => console.warn("openTunerForFile failed:", err));
      }
    };

    input.addEventListener("change", handler, { once: true });
    input.click(); // IMPORTANT: synchronous in the user-gesture stack
  }

  // ---------- Misc helpers ----------
  function bindFileInputRef(el) {
    fileInputRef.current = el || null;
    if (el) {
      el.type = "file";
      el.accept = "image/*";
      el.style.display = "none";
    }
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

  // ---------- Expose API for UI wiring ----------
  return {
    // state
    title,
    setTitle, // keep for controlled inputs if you already use it
    renaming,
    setRenaming, // keep for legacy, but prefer start/commit/cancel helpers below
    results,
    checked,
    fractions,
    setFractions,
    analyzing,
    progress,

    // title editing helpers (recommended)
    titleEditing,         // { renaming, title, onTitleClick, onTitleInputChange, onTitleInputKeyDown, onTitleInputBlur }
    startRenaming,
    commitRenaming,
    cancelRenaming,

    // tuner
    showTuner,
    setShowTuner,
    tunerImage,
    tunerCrops,
    tunerFractions,
    updateTunerFractions,
    confirmTuner,
    cancelTuner,

    // actions
    analyzeScreenshot,
    fillCard,
    bindFileInputRef,
    toggleChecked,
    clearResults,

    // passthrough
    onRemove,
  };
}
