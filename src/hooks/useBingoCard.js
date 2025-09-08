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
    try {
      const img = await fileToImage(file);
      const crops = computeCrops25(img, fractions); // use persisted, confirmed fractions
      const session = await getClipSession();
      const index = await getSpriteIndex();

      const newResults = [];
      for (let i = 0; i < crops.length; i++) {
        try {
          const cropImg = await dataUrlToImage(crops[i]);
          const tensor = await embedImage(cropImg, session);
          const best = findBestMatch(tensor.data, index); // legacy-friendly shape
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
  function fillCard() {
    let input = fileInputRef.current;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";
      document.body.appendChild(input);
      fileInputRef.current = input;
    }
    const handler = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      input.removeEventListener("change", handler);
      if (file) {
        try { await openTunerForFile(file); } catch (err) { console.warn("openTunerForFile failed:", err); }
      }
    };
    input.addEventListener("change", handler, { once: true });
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