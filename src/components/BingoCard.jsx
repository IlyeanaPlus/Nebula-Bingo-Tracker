// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fileToImage,
  crop25,
  get25Rects,
  detectGridFromGreenOverlay,
  normalizeGridLines,
} from "../utils/image";

// IMPORTANT: keep bingo.css wired so the classes below style correctly
import "../styles/bingo.css";

export default function BingoCard() {
  // Title inline edit
  const [title, setTitle] = useState("New Card");
  const [editingTitle, setEditingTitle] = useState(false);

  // Inputs
  const [baseFile, setBaseFile] = useState(null);
  const [overlayFile, setOverlayFile] = useState(null);

  // Crops for this card
  const [crops, setCrops] = useState(Array(25).fill(null));   // 25 PNG dataURLs
  const [rects, setRects] = useState([]);                     // debug only

  // Fill overlay state
  const [filling, setFilling] = useState(false);
  const [fillIndex, setFillIndex] = useState(0);

  // Debug modal (optional; plain)
  const [debugOpen, setDebugOpen] = useState(false);

  const baseImgRef = useRef(null);
  const overlayImgRef = useRef(null);

  const canFill = useMemo(() => !!baseFile, [baseFile]);

  // File pickers
  const onPickBase = (e) => {
    const f = e.target.files?.[0];
    if (f) setBaseFile(f);
  };
  const onPickOverlay = (e) => {
    const f = e.target.files?.[0];
    if (f) setOverlayFile(f);
  };

  async function ensureImagesLoaded() {
    if (baseFile && !baseImgRef.current) baseImgRef.current = await fileToImage(baseFile);
    if (overlayFile && !overlayImgRef.current) overlayImgRef.current = await fileToImage(overlayFile);
  }

  // Fill using natural-pixel pipeline; shows overlay progress
  async function handleFill() {
    if (!canFill) return;
    try {
      setFilling(true);
      setFillIndex(0);

      await ensureImagesLoaded();
      const baseImg = baseImgRef.current;
      if (!baseImg) return;

      // Detect/normalize lines
      let norm;
      if (overlayImgRef.current) {
        const detected = detectGridFromGreenOverlay(overlayImgRef.current);
        norm = normalizeGridLines(baseImg, detected);
      } else {
        norm = normalizeGridLines(baseImg, { vertical: [], horizontal: [] });
      }

      // Compute rects and crops
      const r = get25Rects(baseImg, norm);
      setRects(r);

      // Crop with a little progress animation for the overlay
      const urls = [];
      for (let i = 0; i < r.length; i++) {
        urls.push(crop25(baseImg, norm)[i]); // crop25 returns all; index to simulate progress
        setFillIndex(i + 1);
        await new Promise((res) => setTimeout(res, 12)); // tiny delay for visible progress
      }
      setCrops(urls);

      // Optional: open debug viewer
      setDebugOpen(true);
    } catch (err) {
      console.error("[BingoCard] fill failed:", err);
    } finally {
      setFilling(false);
    }
  }

  // Render a single card using the CSS hooks from bingo.css
  return (
    <div className="cards">
      <div className="card">{/* .card styles size/appearance */}{/* :contentReference[oaicite:1]{index=1} */}
        <div className="card-header">{/* header row */}{/* :contentReference[oaicite:2]{index=2} */}
          {editingTitle ? (
            <input
              className="title-inline"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <div style={{ fontWeight: 600, cursor: "text" }} onClick={() => setEditingTitle(true)}>
              {title}
            </div>
          )}

          <div className="actions">
            <label>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPickBase} />
              <button>Select Screenshot</button>
            </label>
            <label>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPickOverlay} />
              <button>Grid PNG (optional)</button>
            </label>
            <button onClick={handleFill} disabled={!canFill} title={canFill ? "Analyze screenshot & fill" : "Select a screenshot first"}>
              Fill Card
            </button>
            <button onClick={() => setDebugOpen(true)} disabled={!crops.filter(Boolean).length}>
              Crops
            </button>
          </div>
        </div>

        {/* 5×5 grid */}
        <div className="grid-5x5">{/* squares; aspect-ratio enforced in CSS */}{/* :contentReference[oaicite:3]{index=3} */}
          {Array.from({ length: 25 }).map((_, i) => (
            <div className="cell" key={i}>{/* tile */}{/* :contentReference[oaicite:4]{index=4} */}
              {crops[i] ? (
                <img src={crops[i]} alt={`tile ${i + 1}`} draggable={false} />
              ) : (
                <div className="cell-text">—</div>
              )}
            </div>
          ))}
        </div>

        {/* Fill overlay (centered) */}
        {filling && (
          <div className="fill-overlay">{/* dark blur overlay */}{/* :contentReference[oaicite:5]{index=5} */}
            <div className="fill-box">
              <div className="fill-title">Analyzing screenshot...</div>
              <div className="fill-meta">
                {Math.min(fillIndex, 25)} / 25
              </div>
              <div className="fill-bar" style={{ marginTop: 6, marginBottom: 6 }}>{/* styled bar */}{/* :contentReference[oaicite:6]{index=6} */}
                <div
                  className="fill-bar-inner"
                  style={{ width: `${(Math.min(fillIndex, 25) / 25) * 100}%` }}
                />
              </div>
              <div className="fill-hint">Tip: Drop an image anywhere on this card to start.</div>
            </div>
          </div>
        )}
      </div>

      {/* Debug crops (plain, not styled by bingo.css) */}
      {debugOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDebugOpen(false)} />
          <div className="relative z-[1001] w-[360px] max-h-[85vh] overflow-auto rounded-2xl bg-[#1e1e1e] text-[#e8e8e8] shadow-2xl border border-[#2a2a2a]">
            <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] bg-[#1e1e1e]/90">
              <div style={{ fontWeight: 600 }}>Last Fill — Crops</div>
              <button onClick={() => setDebugOpen(false)}>Close</button>
            </div>
            <div className="px-3 py-4">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {crops.map((url, idx) => (
                  <div key={idx} style={{ padding: 4, borderRadius: 6, border: "1px solid #2a2a2a", background: "#1a1a1a" }}>
                    {url && <img src={url} alt={`crop ${idx + 1}`} draggable={false} style={{ display: "block", width: 56, height: 56 }} />}
                    <div style={{ marginTop: 4, fontSize: 11, color: "#b6b6b6", textAlign: "center" }}>#{idx + 1}</div>
                  </div>
                ))}
              </div>
              {rects?.[0] && (
                <pre style={{ marginTop: 12, fontSize: 12, color: "#b6b6b6", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  rect[1] (w × h): {rects[0].w} × {rects[0].h}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
