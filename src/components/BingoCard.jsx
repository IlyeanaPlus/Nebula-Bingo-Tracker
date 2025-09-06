// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// v2 baseline helpers (natural-pixel)
import {
  fileToImage,
  crop25,
  get25Rects,
  detectGridFromGreenOverlay,
  normalizeGridLines,
} from "../utils/image";

// Scoped styles for the Crops modal only (won’t affect base UI)
import "../styles/debug-crops.css";

export default function BingoCard() {
  // --- Title (kept as baseline: click-to-rename only) ---
  const [title, setTitle] = useState("Bingo Card");
  const [editingTitle, setEditingTitle] = useState(false);

  // --- Inputs used by your fill flow (unchanged semantics) ---
  const [baseFile, setBaseFile] = useState(null);
  const [overlayFile, setOverlayFile] = useState(null);

  // --- Debug crops state (modal only) ---
  const [lastFillCrops, setLastFillCrops] = useState([]); // 25 dataURLs
  const [lastRects, setLastRects] = useState([]);         // 25 rects
  const [debugOpen, setDebugOpen] = useState(false);

  const baseImgRef = useRef(null);
  const overlayImgRef = useRef(null);

  // Close debug on Esc (modal only)
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setDebugOpen(false);
    if (debugOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debugOpen]);

  const canFill = useMemo(() => !!baseFile, [baseFile]);

  // --- Baseline handlers (unchanged semantics) ---
  const handleChooseBase = (e) => {
    const f = e.target.files?.[0];
    if (f) setBaseFile(f);
  };
  const handleChooseOverlay = (e) => {
    const f = e.target.files?.[0];
    if (f) setOverlayFile(f);
  };

  async function ensureImagesLoaded() {
    if (baseFile && !baseImgRef.current) baseImgRef.current = await fileToImage(baseFile);
    if (overlayFile && !overlayImgRef.current) overlayImgRef.current = await fileToImage(overlayFile);
  }

  // This is your existing Fill action; preserved. It now also records rects
  // for the debug modal, but does not alter your matching flow.
  async function handleFill() {
    try {
      await ensureImagesLoaded();
      const baseImg = baseImgRef.current;
      if (!baseImg) return;

      let norm, rects, dataURLs;

      if (overlayImgRef.current) {
        const detected = detectGridFromGreenOverlay(overlayImgRef.current);
        norm = normalizeGridLines(baseImg, detected);
      } else {
        norm = normalizeGridLines(baseImg, { vertical: [], horizontal: [] });
      }

      rects = get25Rects(baseImg, norm);
      dataURLs = crop25(baseImg, norm);

      setLastRects(rects);
      setLastFillCrops(dataURLs);
      setDebugOpen(true); // modal only; doesn’t affect card UI
    } catch (err) {
      console.error("[BingoCard] fill failed:", err);
    }
  }

  return (
    <div className="w-full">
      {/* ---- Header (kept minimal; no size overrides) ---- */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {editingTitle ? (
          <input
            autoFocus
            className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-100 border border-neutral-700"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <h2
            className="text-lg font-semibold cursor-text"
            title="Click to rename"
            onClick={() => setEditingTitle(true)}
          >
            {title}
          </h2>
        )}

        <div className="flex items-center gap-2">
          {/* Choose base screenshot (unchanged) */}
          <label className="inline-flex items-center px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 cursor-pointer hover:bg-neutral-750">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseBase} />
            <span>Select Screenshot</span>
          </label>

          {/* Optional overlay grid PNG (unchanged) */}
          <label className="inline-flex items-center px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 cursor-pointer hover:bg-neutral-750">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseOverlay} />
            <span>Grid PNG (optional)</span>
          </label>

          {/* Your existing Fill action (function unchanged) */}
          <button
            className="px-3 py-1.5 rounded-md bg-neutral-200 text-neutral-900 disabled:opacity-40"
            disabled={!canFill}
            onClick={handleFill}
            title={canFill ? "Analyze screenshot & fill" : "Select a screenshot first"}
          >
            Fill Card
          </button>

          {/* Open last crops (debug-only) */}
          <button
            className="px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700"
            onClick={() => setDebugOpen(true)}
            disabled={!lastFillCrops.length}
            title="Open last crops"
          >
            Crops
          </button>
        </div>
      </div>

      {/*
        IMPORTANT:
        We intentionally do NOT render/replace your card grid or sizing.
        Keep your existing base card UI wherever it already lives.
        (Previously, a placeholder grid here altered card size—removed now.)
      */}

      {/* ---- Debug Crops Modal (square tiles; fully scoped styles) ---- */}
      {debugOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setDebugOpen(false)} />

          {/* Panel */}
          <div className="relative z-[1001] w-[360px] max-h-[85vh] overflow-auto rounded-2xl bg-neutral-900 text-neutral-200 shadow-2xl border border-neutral-800">
            <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur">
              <div className="font-semibold">Last Fill — Crops</div>
              <button
                className="px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700"
                onClick={() => setDebugOpen(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>

            <div className="px-3 py-4">
              <div className="nbt-crops-grid">
                {lastFillCrops.map((dataURL, idx) => (
                  <div key={idx} className="nbt-crop-wrap">
                    <div className="nbt-crop-tile">
                      <img className="nbt-crop-img" src={dataURL} alt={`crop ${idx + 1}`} draggable={false} />
                    </div>
                    <div className="nbt-crop-label">#{idx + 1}</div>
                  </div>
                ))}
              </div>

              {/* Optional: sanity line to verify squares; harmless if left in */}
              {lastRects?.[0] && (
                <pre className="mt-3 text-xs text-neutral-400 whitespace-pre-wrap break-all">
                  rect[1] (w × h): {lastRects[0].w} × {lastRects[0].h}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
