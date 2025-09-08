// src/hooks/useBingoCard.js
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import { prepareEmbedIndex, findBestMatchEmbed } from "../utils/clipMatcher";

/**
 * Bingo card logic hook — CLIP (embedding) matcher only.
 * UI (BingoCardView / GridTunerModal) stays dumb; this owns state + pipeline.
 *
 * Fractions in this hook are exposed to the tuner as a SQUARE {x,y,w,h} in 0..1,
 * but computeCrops25 expects a GRID with top/left/right/bottom + equal cols/rows.
 */

// ---------- helpers ----------
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// grid (image.js) -> square (modal)
function gridToSquare(fr) {
  if (!fr) return { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  const x = fr.left ?? 0;
  const y = fr.top ?? 0;
  const w = (fr.right ?? 1) - (fr.left ?? 0);
  const h = (fr.bottom ?? 1) - (fr.top ?? 0);
  const s = Math.max(0.05, Math.min(1, Math.min(w, h)));
  let sx = clamp01(x);
  let sy = clamp01(y);
  sx = Math.min(sx, 1 - s);
  sy = Math.min(sy, 1 - s);
  return { x: sx, y: sy, w: s, h: s };
}

// square (modal) -> grid (image.js)
function squareToGrid(fr) {
  const top = fr.y;
  const left = fr.x;
  const right = fr.x + fr.w;
  const bottom = fr.y + fr.h;
  const eq = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
  return { top, left, right, bottom, cols: eq(5), rows: eq(5) };
}

// blob URL -> HTMLImageElement
function urlToImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));

  // Load persisted GRID fractions, expose SQUARE to the modal
  const persistedGrid = loadFractions();
  const [fractions, setFractions] = useState(gridToSquare(persistedGrid)); // SQUARE {x,y,w,h}

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Tuner modal + file input state
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const fileRef = useRef(null);

  // We don’t actually need manifest anymore for CLIP matching, but leave the flag for UI gating if desired
  const spritesReady = true;

  // --- Title rename flow ---
  function startRename() { setRenaming(true); }

  function submitRename(e) {
    e?.preventDefault?.();
    setRenaming(false);
    onChange?.({ ...(card || {}), title });
  }

  function onTitleChange(e) {
    const t = e.target.value;
    setTitle(t);
    onChange?.({ ...(card || {}), title: t, cells: results, checked });
  }

  // --- Pick image flow (opens OS picker reliably) ---
  function pickImage() {
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (pendingImageSrc) {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
    }

    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  // --- Tuner confirm/cancel ---
  async function confirmTuner(newSquareFractions) {
    setShowTuner(false);
    if (!pendingImageSrc) return;

    setAnalyzing(true);
    setProgress(0);

    try {
      // Normalize square & keep inside bounds
      const sq = {
        x: clamp01(newSquareFractions?.x ?? fractions.x),
        y: clamp01(newSquareFractions?.y ?? fractions.y),
        w: clamp01(newSquareFractions?.w ?? fractions.w),
        h: clamp01(newSquareFractions?.h ?? fractions.h),
      };
      const s = Math.max(0.05, Math.min(1, Math.min(sq.w, sq.h)));
      const sqNorm = { x: Math.min(sq.x, 1 - s), y: Math.min(sq.y, 1 - s), w: s, h: s };

      // Persist GRID form; keep SQUARE form in state for next open
      const gridFractions = squareToGrid(sqNorm);
      saveFractions(gridFractions);
      setFractions(sqNorm);

      // Load the blob URL into an Image for computeCrops25
      const imgEl = await urlToImage(pendingImageSrc);

      // 1) Crop to 25 cells
      const crops = computeCrops25(imgEl, gridFractions);
      if (!Array.isArray(crops) || crops.length !== 25) {
        console.error("[useBingoCard] computeCrops25 did not return 25 crops:", crops);
        setProgress(100);
        return;
      }
      // expose to console tools
      try { window.__seenCrops = crops.slice(0); } catch {}
      setProgress(20);
      console.log("[useBingoCard] 25 crops ready");

      // 2) Embed + match against sprites (CLIP)
      let next = Array(25).fill(null);
      const refIndex = await prepareEmbedIndex(); // loads sprite_index_clip.json once
      console.log("[useBingoCard] embed index loaded:", refIndex?.list?.length, "sprites");
      setProgress(25);

      for (let i = 0; i < 25; i++) {
        try {
          const cropUrl = crops[i]; // dataURL string from computeCrops25
          const best = await findBestMatchEmbed(cropUrl, refIndex);
          next[i] = best ? { label: best.name, matchKey: best.key, matchUrl: best.src } : null;
          if ((i % 5) === 4) {
            console.log(`[useBingoCard] matched cells 0..${i} (last=${best?.name || "none"})`);
          }
        } catch (e) {
          console.warn(`[useBingoCard] match failed for cell ${i}`, e);
          next[i] = null;
        }
        setProgress(25 + Math.round(((i + 1) / 25) * 75));
      }

      setResults(next);
      onChange?.({ ...(card || {}), title, cells: next, fractions: sqNorm });
      console.log("[useBingoCard] matching complete");
    } catch (err) {
      console.error("[useBingoCard] confirmTuner error:", err);
      setProgress(100);
    } finally {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
      setPendingImageSrc(null);
      setAnalyzing(false);
    }
  }

  function cancelTuner() {
    setShowTuner(false);
    if (pendingImageSrc) {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
    }
    setPendingImageSrc(null);
  }

  // --- Cell toggle ---
  function toggleCell(i) {
    setChecked(prev => {
      const copy = prev.slice();
      copy[i] = !copy[i];
      onChange?.({ ...(card || {}), title, cells: results, checked: copy });
      return copy;
    });
  }

  // Provide both a ready element and props (supports either usage in the view)
  const fileInputProps = {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    style: { display: "none" },
    onChange: onPickFile,
  };
  // Avoid JSX inside .js file (keeps TS/JSX build happy)
  const fileInput = React.createElement("input", fileInputProps);

  return {
    // State for the view
    title,
    renaming,
    analyzing,
    progress,
    spritesReady,
    cells: results,
    checked,

    // Actions
    startRename,
    submitRename,
    onTitleChange,
    pickImage,
    onRemove, // passthrough for header Remove button
    toggleCell,

    // Hidden file input
    fileInputProps,
    fileInput,

    // Tuner modal plumbing
    showTuner,
    pendingImageSrc,
    fractions,   // SQUARE {x,y,w,h} for GridTunerModal initialFractions
    confirmTuner,
    cancelTuner,
  };
}
