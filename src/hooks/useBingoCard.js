// src/hooks/useBingoCard.js
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

/**
 * Encapsulates all BingoCard logic; keeps UI separate and stable.
 * Consumer provides: card, manifest, onChange, onRemove
 *
 * NOTE ON FRACTIONS:
 * - The hook's public `fractions` state is a SQUARE object {x,y,w,h} for the GridTunerModal.
 * - We convert to the GRID schema {top,left,right,bottom, cols, rows} only when calling computeCrops25()
 *   and when persisting via saveFractions().
 */

// ---------- helpers ----------
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

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

  // Load persisted GRID fractions, but expose SQUARE to the UI (modal)
  const persistedGrid = loadFractions();                // {top,left,right,bottom, cols, rows}
  const [fractions, setFractions] = useState(           // SQUARE {x,y,w,h}
    gridToSquare(persistedGrid)
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Tuner modal + file input state
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const fileRef = useRef(null);

  const spritesReady = !!manifest && Object.keys(manifest).length > 0;

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
    // Auto-persist as you type
    onChange?.({ ...(card || {}), title: t, cells: results, checked });
  }

  // --- Pick image flow (opens OS picker reliably) ---
  function pickImage() {
    if (fileRef.current) {
      // Ensure onChange fires even if the user re-selects the same file
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke any previous object URL to avoid memory leaks
    if (pendingImageSrc) {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
    }

    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  // --- Tuner confirm/cancel ---
  async function confirmTuner(newSquareFractions) {
    // newSquareFractions: {x,y,w,h} from GridTunerModal
    setShowTuner(false);

    if (!pendingImageSrc) return;

    setAnalyzing(true);
    setProgress(0);

    try {
      // Normalize, persist (as GRID), and keep SQUARE in state for future openings
      const sq = {
        x: clamp01(newSquareFractions?.x ?? fractions.x),
        y: clamp01(newSquareFractions?.y ?? fractions.y),
        w: clamp01(newSquareFractions?.w ?? fractions.w),
        h: clamp01(newSquareFractions?.h ?? fractions.h),
      };
      // keep inside bounds
      const s = Math.max(0.05, Math.min(1, Math.min(sq.w, sq.h)));
      let sx = Math.min(sq.x, 1 - s);
      let sy = Math.min(sq.y, 1 - s);
      const sqNorm = { x: sx, y: sy, w: s, h: s };

      setFractions(sqNorm); // for the next time tuner opens

      const gridFractions = squareToGrid(sqNorm); // what image.js expects
      saveFractions(gridFractions);

      // Load the blob URL into an Image for computeCrops25
      const imgEl = await urlToImage(pendingImageSrc);

      // 1) Crop to 25 equal cells within the tuned square
      const crops = computeCrops25(imgEl, gridFractions);
      if (!Array.isArray(crops) || crops.length !== 25) {
        console.error("[useBingoCard] computeCrops25 did not return 25 crops:", crops);
        setProgress(100);
        return;
      }
      setProgress(30);

      // 2) Optional sprite matching
      let next = Array(25).fill(null);
      if (spritesReady) {
        const refs = await prepareRefIndex(manifest);
        for (let i = 0; i < 25; i++) {
          try {
            const best = await findBestMatch(crops[i], refs);
            next[i] = best
              ? { label: best.name, matchKey: best.key, matchUrl: best.src }
              : null;
          } catch (e) {
            console.warn(`[useBingoCard] match failed for cell ${i}`, e);
            next[i] = null;
          }
          setProgress(30 + Math.round(((i + 1) / 25) * 70));
        }
      } else {
        setProgress(100);
      }

      setResults(next);
      onChange?.({ ...(card || {}), title, cells: next, fractions: sqNorm });
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
  // Some views expect an element prop (no JSX in .js files)
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
    onRemove, // passed through for the header Remove button
    toggleCell,

    // Hidden file input (use either one)
    fileInputProps,
    fileInput,

    // Tuner modal plumbing
    showTuner,
    pendingImageSrc,
    fractions,       // SQUARE {x,y,w,h} for GridTunerModal initialFractions
    confirmTuner,
    cancelTuner,
  };
}
