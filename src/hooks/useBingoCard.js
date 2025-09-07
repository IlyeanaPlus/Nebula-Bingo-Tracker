// src/hooks/useBingoCard.js
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

/**
 * Bingo card logic hook.
 * UI (BingoCardView / GridTunerModal) stays dumb; this owns state + pipeline.
 *
 * Fractions:
 * - Exposed to the tuner as a SQUARE {x,y,w,h} in 0..1.
 * - Persisted/used for cropping as GRID {top,left,right,bottom, cols[], rows[]}.
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

// manifest can be an array OR a dictionary; convert to array the matcher expects
function normalizeManifest(man) {
  if (Array.isArray(man)) return man;
  if (man && typeof man === "object") {
    return Object.keys(man).map((k) => {
      const v = man[k] || {};
      const src = v.url || v.src || v.image;
      if (!src) return null;
      // keep 'name' for display, key can be derived inside matcher if needed
      return { name: v.name || k, src };
    }).filter(Boolean);
  }
  return [];
}

// --- validation + single-cell recovery for crops ---
function isDataUrl(v) {
  return typeof v === "string" && v.startsWith("data:image/");
}

// recompute a single cell directly from the tuned grid if a crop is missing
function recomputeCellDataUrl(imgEl, gridFractions, r, c) {
  const { top, left, right, bottom, cols, rows } = gridFractions;
  const L = left * imgEl.width,  R = right * imgEl.width;
  const T = top  * imgEl.height, B = bottom * imgEl.height;
  const W = R - L, H = B - T;
  const x0 = L + W * cols[c];
  const x1 = L + W * cols[c + 1];
  const y0 = T + H * rows[r];
  const y1 = T + H * rows[r + 1];
  const cellW = x1 - x0, cellH = y1 - y0;
  const side = Math.max(1, Math.floor(Math.min(cellW, cellH)));
  const cx = x0 + (cellW - side) / 2;
  const cy = y0 + (cellH - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = side; canvas.height = side;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imgEl, cx, cy, side, side, 0, 0, side, side);
  return canvas.toDataURL("image/png");
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
    // newSquareFractions: {x,y,w,h} from GridTunerModal
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
      let crops = computeCrops25(imgEl, gridFractions);
      if (!Array.isArray(crops) || crops.length !== 25) {
        console.error("[useBingoCard] computeCrops25 did not return 25 crops:", crops);
        setProgress(100);
        return;
      }

      // Harden crops: ensure every entry is a dataURL; if not, recompute that cell
      for (let i = 0; i < 25; i++) {
        if (!isDataUrl(crops[i])) {
          const r = Math.floor(i / 5), c = i % 5;
          crops[i] = recomputeCellDataUrl(imgEl, gridFractions, r, c);
        }
      }

      setProgress(30);

      // 2) Optional: match against sprites
      let next = Array(25).fill(null);
      if (spritesReady) {
        const refIndex = await prepareRefIndex(normalizeManifest(manifest));
        const refList = Array.isArray(refIndex) ? refIndex : (refIndex?.list || []);

        if (!Array.isArray(refList) || refList.length === 0) {
          console.warn("[useBingoCard] No reference sprites available for matching.");
          setProgress(100);
        } else {
          for (let i = 0; i < 25; i++) {
            try {
              const input = crops[i]; // dataURL string
              if (!isDataUrl(input)) {
                console.warn(`[useBingoCard] cell ${i} crop invalid after recovery; skipping`);
                next[i] = null;
              } else {
                const best = await findBestMatch(input, refList); // pass array of refs
                next[i] = best
                  ? { label: best.name, matchKey: best.key, matchUrl: best.src }
                  : null;
              }
            } catch (e) {
              console.warn(`[useBingoCard] match failed for cell ${i}`, e);
              next[i] = null;
            }
            setProgress(30 + Math.round(((i + 1) / 25) * 70));
          }
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
  // Avoid JSX inside .js file (fixes “Expression expected” build errors)
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
