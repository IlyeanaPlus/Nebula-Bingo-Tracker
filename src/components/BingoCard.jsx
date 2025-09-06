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

// Re-wire only your base card styles (no debug modal css here)
import "../styles/bingo.css";

export default function BingoCard() {
  // Title (click-to-rename)
  const [title, setTitle] = useState("Bingo Card");
  const [editingTitle, setEditingTitle] = useState(false);

  // Inputs for fill flow
  const [baseFile, setBaseFile] = useState(null);
  const [overlayFile, setOverlayFile] = useState(null);

  // Debug crops (kept functional, but visual is plain)
  const [lastFillCrops, setLastFillCrops] = useState([]); // 25 dataURLs
  const [lastRects, setLastRects] = useState([]);         // 25 rects
  const [debugOpen, setDebugOpen] = useState(false);

  const baseImgRef = useRef(null);
  const overlayImgRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setDebugOpen(false);
    if (debugOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debugOpen]);

  const canFill = useMemo(() => !!baseFile, [baseFile]);

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

  // Fill flow: unchanged semantics, now also records rects for debug
  async function handleFill() {
    try {
      await ensureImagesLoaded();
      const baseImg = baseImgRef.current;
      if (!baseImg) return;

      let norm;
      if (overlayImgRef.current) {
        const detected = detectGridFromGreenOverlay(overlayImgRef.current);
        norm = normalizeGridLines(baseImg, detected);
      } else {
        norm = normalizeGridLines(baseImg, { vertical: [], horizontal: [] });
      }

      const rects = get25Rects(baseImg, norm);
      const dataURLs = crop25(baseImg, norm);

      setLastRects(rects);
      setLastFillCrops(dataURLs);
      setDebugOpen(true);
    } catch (err) {
      console.error("[BingoCard] fill failed:", err);
    }
  }

  return (
    <div className="bingo-card w-full">
      {/* Header / toolbar — classes left intact for bingo.css */}
      <div className="bingo-toolbar flex items-center justify-between gap-3 mb-3">
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
          <label className="inline-flex items-center px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 cursor-pointer hover:bg-neutral-750">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseBase} />
            <span>Select Screenshot</span>
          </label>

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

      {/* NOTE: Your actual bingo card grid/content is rendered elsewhere in v2.
               We do NOT add or change any base card markup here. */}

      {/* Debug Crops Modal — reverted to plain layout (no extra CSS) */}
      {debugOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDebugOpen(false)} />
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
              {/* Simple, style-neutral list so it won't affect base visuals */}
              <div className="flex flex-wrap gap-2">
                {lastFillCrops.map((dataURL, idx) => (
                  <div key={idx} className="p-1 rounded border border-neutral-800 bg-neutral-900">
                    <img
                      src={dataURL}
                      alt={`crop ${idx + 1}`}
                      draggable={false}
                      style={{ display: "block", width: 56, height: 56 }}
                    />
                    <div className="mt-1 text-[11px] text-neutral-400 text-center">#{idx + 1}</div>
                  </div>
                ))}
              </div>

              {/* Optional: rect sanity (harmless; delete if noisy) */}
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
