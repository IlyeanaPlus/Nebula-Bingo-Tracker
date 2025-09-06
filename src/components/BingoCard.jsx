// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// v2 natural-pixel helpers
import {
  fileToImage,
  crop25,
  get25Rects,
  detectGridFromGreenOverlay,
  normalizeGridLines,
} from "../utils/image";

// base card styles
import "../styles/bingo.css";

export default function BingoCard() {
  // Title (click-to-rename, same as v2)
  const [title, setTitle] = useState("Bingo Card");
  const [editingTitle, setEditingTitle] = useState(false);

  // Inputs
  const [baseFile, setBaseFile] = useState(null);
  const [overlayFile, setOverlayFile] = useState(null);

  // Crops for this card (used for preview + matcher upstream)
  const [lastFillCrops, setLastFillCrops] = useState([]); // 25 PNG dataURLs
  const [lastRects, setLastRects] = useState([]);         // 25 rects (debug)
  const [debugOpen, setDebugOpen] = useState(false);

  const baseImgRef = useRef(null);
  const overlayImgRef = useRef(null);

  // Ensure Esc closes the modal
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setDebugOpen(false);
    if (debugOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [debugOpen]);

  const canFill = useMemo(() => !!baseFile, [baseFile]);

  // ---- file pickers (same semantics) ----
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

  // ---- Fill flow (kept; now also previews crops in grid) ----
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
      setLastFillCrops(dataURLs);   // <- immediately visible in the grid
      setDebugOpen(true);           // optional; can be toggled off if you prefer
    } catch (err) {
      console.error("[BingoCard] fill failed:", err);
    }
  }

  // ---- Render ----
  return (
    <div className="bingo-card">
      {/* Header / toolbar row (hooks preserved for bingo.css) */}
      <div className="bingo-toolbar">
        <div className="bingo-title">
          {editingTitle ? (
            <input
              autoFocus
              className="bingo-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <span className="bingo-title-text" onClick={() => setEditingTitle(true)} title="Click to rename">
              {title}
            </span>
          )}
        </div>

        <div className="bingo-actions">
          {/* Select Screenshot */}
          <label className="btn btn-file">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseBase} />
            <span>Select Screenshot</span>
          </label>

          {/* Optional overlay grid PNG */}
          <label className="btn btn-file">
            <input type="file" accept="image/*" className="hidden" onChange={handleChooseOverlay} />
            <span>Grid PNG (optional)</span>
          </label>

          {/* Fill (disabled until screenshot selected) */}
          <button
            className="btn btn-primary"
            disabled={!canFill}
            onClick={handleFill}
            title={canFill ? "Analyze screenshot & fill" : "Select a screenshot first"}
          >
            Fill Card
          </button>

          {/* Open last crops modal */}
          <button
            className="btn"
            onClick={() => setDebugOpen(true)}
            disabled={!lastFillCrops.length}
            title="Open last crops"
          >
            Crops
          </button>
        </div>
      </div>

      {/* Visible 5×5 card grid (restored) */}
      <div className="bingo-grid">
        {Array.from({ length: 25 }).map((_, i) => {
          const imgUrl = lastFillCrops[i] || null;
          return (
            <div key={i} className="bingo-cell">
              {imgUrl ? (
                <img
                  className="bingo-cell-img"
                  src={imgUrl}
                  alt={`slot ${i + 1}`}
                  draggable={false}
                />
              ) : (
                <div className="bingo-cell-empty">—</div>
              )}
              <div className="bingo-cell-meta">
                <div className="bingo-cell-status">— no match</div>
                <div className="bingo-cell-index">#{i + 1}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Debug Crops Modal (plain; won’t affect base CSS) */}
      {debugOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDebugOpen(false)} />
          <div className="relative z-[1001] w-[360px] max-h-[85vh] overflow-auto rounded-2xl bg-neutral-900 text-neutral-200 shadow-2xl border border-neutral-800">
            <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur">
              <div className="font-semibold">Last Fill — Crops</div>
              <button className="px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700" onClick={() => setDebugOpen(false)}>
                Close
              </button>
            </div>
            <div className="px-3 py-4">
              <div className="flex flex-wrap gap-2">
                {lastFillCrops.map((url, idx) => (
                  <div key={idx} className="p-1 rounded border border-neutral-800 bg-neutral-900">
                    <img src={url} alt={`crop ${idx + 1}`} draggable={false} style={{ display: "block", width: 56, height: 56 }} />
                    <div className="mt-1 text-[11px] text-neutral-400 text-center">#{idx + 1}</div>
                  </div>
                ))}
              </div>
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
