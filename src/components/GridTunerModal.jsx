// src/components/GridTunerModal.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * GridTunerModal
 * Accepts either:
 *   - imageSrc (string URL/data URL) OR
 *   - image (HTMLImageElement)
 * Also accepts:
 *   - initialFractions or fractions (back-compat): { left, top, width, height }
 */
export default function GridTunerModal({
  image,
  imageSrc,
  crops,
  initialFractions,
  fractions,
  onChange,
  onConfirm,
  onCancel,
}) {
  // Normalize props
  const src = imageSrc ?? image?.src ?? null;
  const [imgSize, setImgSize] = useState({ w: 1000, h: 1000 });
  const [frac, setFrac] = useState(initialFractions ?? fractions ?? { left: 0, top: 0, width: 1, height: 1 });

  // Load intrinsic size when src changes
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => setImgSize({ w: i.naturalWidth || 1000, h: i.naturalHeight || 1000 });
    i.src = src;
  }, [src]);

  // allow parent to observe changes
  useEffect(() => {
    onChange?.(frac);
  }, [frac, onChange]);

  const [zoom, setZoom] = useState(1.5);
  const [fitToken, setFitToken] = useState(0);

  // Fit to viewport
  useEffect(() => {
    const fit = () => {
      const vw = Math.max(320, window.innerWidth * 0.8);
      const vh = Math.max(240, window.innerHeight * 0.8);
      const scale = Math.min(vw / imgSize.w, vh / imgSize.h);
      setZoom(Math.max(0.5, Math.min(3, scale)));
    };
    fit();
  }, [imgSize, fitToken]);

  const styleStage = useMemo(() => ({
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    width: imgSize.w,
    height: imgSize.h,
    position: "relative",
    imageRendering: "auto",
  }), [zoom, imgSize]);

  const stroke = 1 / zoom;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "grid", placeItems: "center", zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        style={{
          background: "#111", color: "#eee", padding: 12, borderRadius: 12,
          maxWidth: "96vw", maxHeight: "92vh", overflow: "auto",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button onClick={() => setFitToken(t => t + 1)} style={btn}>Fit</button>
          <span style={{ fontSize: 12, opacity: 0.8, width: 90 }}>Zoom: {(zoom * 100) | 0}%</span>
          <input
            type="range" min={0.5} max={3} step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} style={btn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btn, background: "#2b6", color: "#000" }}>Confirm</button>
        </div>

        {/* Stage */}
        <div style={{ position: "relative", overflow: "hidden", background: "#000" }}>
          <div style={styleStage}>
            {src && <img src={src} alt="" draggable={false} />}
            {/* Overlay: 5x5 grid lines */}
            <svg
              width={imgSize.w}
              height={imgSize.h}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const x = imgSize.w * (i / 5);
                const y = imgSize.h * (i / 5);
                return (
                  <React.Fragment key={i}>
                    <line x1={x} y1={0} x2={x} y2={imgSize.h}
                          stroke="rgba(0,255,255,0.6)" strokeWidth={stroke} />
                    <line x1={0} y1={y} x2={imgSize.w} y2={y}
                          stroke="rgba(0,255,255,0.6)" strokeWidth={stroke} />
                  </React.Fragment>
                );
              })}
              {/* Fractions rect */}
              {frac && (
                <rect
                  x={imgSize.w * (frac.left || 0)}
                  y={imgSize.h * (frac.top || 0)}
                  width={imgSize.w * (frac.width || 1)}
                  height={imgSize.h * (frac.height || 1)}
                  fill="rgba(255,255,0,0.15)"
                  stroke="rgba(255,255,0,0.9)"
                  strokeWidth={stroke}
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

const btn = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #666",
  background: "#222",
  color: "#eee",
  cursor: "pointer",
};
