// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// Image/grid helpers (v2 baseline, natural-pixel)
import {
  fileToImage,
  crop25,
  get25Rects,
  detectGridFromGreenOverlay,
  normalizeGridLines,
} from "../utils/image";

// Square debug crops styles
import "../styles/debug-crops.css";

/**
 * BingoCard
 * - Minimal, v2-friendly card with “Fill Card” flow
 * - Shows the “Last Fill — Crops” debug modal with true-square tiles
 *
 * Notes:
 * - This component assumes you’ll provide a screenshot (base image)
 *   and optionally a green-overlay grid image. If you don’t use the
 *   overlay flow, you can wire your own detector and pass its lines
 *   into `crop25` (natural or {space:'client'}).
 */
export default function BingoCard() {
  const [title, setTitle] = useState("Bingo Card");
  const [editingTitle, setEditingTitle] = useState(false);

  const [baseFile, setBaseFile] = useState(null);
  const [overlayFile, setOverlayFile] = useState(null);

  const [lastFillCrops, setLastFillCrops] = useState([]); // 25 dataURLs
  const [lastRects, setLastRects] = useState([]);         // 25 rects (natural px)
  const [debugOpen, setDebugOpen] = useState(false);

  const baseImgRef = useRef(null);
  const overlayImgRef = useRef(null);

  // Close debug on Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setDebugOpen(false);
    };
    if (debugOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debugOpen]);

  const canFill = useMemo(() => !!baseFile, [baseFile]);

  async function handleChooseBase(e) {
    const f = e.target.files?.[0];
    if (f) setBaseFile(f);
  }
  async function handleChooseOverlay(e) {
    const f = e.target.files?.[0];
    if (f) setOverlayFile(f);
  }

  async function loadImagesIfNeeded() {
    if (baseFile && !baseImgRef.current) {
      baseImgRef.current = await fileToImage(baseFile);
    }
    if (overlayFile && !overlayImgRef.current) {
      overlayImgRef.current = await fileToImage(overlayFile);
    }
  }

  async function handleFill() {
    try {
      await loadImagesIfNeeded();
      const baseImg = baseImgRef.current;
      if (!baseImg) return;

      let dataURLs = [];
      let rects = [];

      if (overlayImgRef.current) {
        // Preferred path: detect lines from the bright-green overlay
        const detected = detectGridFromGreenOverlay(overlayImgRef.current);
        const norm = normalizeGridLines(baseImg, detected);
        rects = get25Rects(baseImg, norm);
        dataURLs = crop25(baseImg, norm);
      } else {
        // Fallback: equal spacing (normalize handles the fallback)
        const norm = normalizeGridLines(baseImg, { vertical: [], horizontal: [] });
        rects = get25Rects(baseImg, norm);
        dataURLs = crop25(baseImg, norm);
      }

      setLastRects(rects);
      setLastFillCrops(dataURLs);
      setDebugOpen(true);
    } catch (err) {
      console.error("[BingoCard] fill failed:", err);
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {editingTitle ? (
          <input
            autoFocus
            className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-100 border border-neutral-700"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingTitle(false);
              if (e.key === "Escape") setEditingTitle(false);
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
          {/* Choose base screenshot */}
          <label className="inline-flex items-center px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 cursor-pointer hover:bg-neutral-750">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseBase} />
            <span>Select Screenshot</span>
          </label>

          {/* Optional: choose green overlay grid PNG */}
          <label className="inline-flex items-center px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 cursor-pointer hover:bg-neutral-750">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseOverlay} />
            <span>Grid PNG (optional)</span>
          </label>

          <button
            className="px-3 py-1.5 rounded-md bg-neutral-200 text-neutral-900 disabled:opacity-40"
            disabled={!canFill}
            onClick={handleFill}
            title={canFill ? "Analyze screenshot & fill" : "Select a screenshot first"}
          >
            Fill Card
          </button>

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

      {/* Card grid placeholder (your existing card UI can live here) */}
      <div
        className="grid grid-cols-5 gap-2 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800"
        style={{ minHeight: 280 }}
      >
        {[...Array(25)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-neutral-800/60 border border-neutral-800 aspect-square"
          />
        ))}
      </div>

      {/* Debug Crops Modal */}
      {debugOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDebugOpen(false)}
          />

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
              {/* Square grid */}
              <div className="nbt-crops-grid">
                {lastFillCrops.map((dataURL, idx) => (
                  <div key={idx} className="nbt-crop-wrap">
                    <div className="nbt-crop-tile">
                      <img
                        className="nbt-crop-img"
                        src={dataURL}
                        alt={`crop ${idx + 1}`}
                        draggable={false}
                      />
                    </div>
                    <div className="nbt-crop-label">#{idx + 1}</div>
                  </div>
                ))}
              </div>

              {/* Optional: sanity line for square rects */}
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
