// src/components/GridTunerModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function GridTunerModal({
  image,            // HTMLImageElement or data URL
  crops,            // existing 25 crops meta
  fractions,        // { left, top, width, height } or similar
  onChange,
  onConfirm,
  onCancel,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1.5); // start larger
  const [fitToken, setFitToken] = useState(0);

  // Fit image to 80% of viewport on mount or when clicking “Fit”
  useEffect(() => {
    const fit = () => {
      const vw = Math.max(320, window.innerWidth * 0.8);
      const vh = Math.max(240, window.innerHeight * 0.8);
      const iw = image?.naturalWidth || 1000;
      const ih = image?.naturalHeight || 1000;
      const scale = Math.min(vw / iw, vh / ih);
      // bound zoom
      setZoom(Math.max(0.5, Math.min(3, scale)));
    };
    fit(); // once
  }, [image, fitToken]);

  const styleStage = useMemo(() => ({
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    width: image?.naturalWidth || "auto",
    height: image?.naturalHeight || "auto",
    position: "relative",
    imageRendering: "auto",
  }), [zoom, image]);

  const stroke = 1 / zoom; // keep grid lines visually 1px
  const overlay = (
    <svg
      width={image?.naturalWidth || 1000}
      height={image?.naturalHeight || 1000}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {/* 5x5 grid */}
      {Array.from({ length: 6 }).map((_, i) => {
        const x = (image?.naturalWidth || 1000) * (i / 5);
        const y = (image?.naturalHeight || 1000) * (i / 5);
        return (
          <React.Fragment key={i}>
            <line x1={x} y1={0} x2={x} y2={image?.naturalHeight || 1000}
                  stroke="rgba(0,255,255,0.6)" strokeWidth={stroke} />
            <line x1={0} y1={y} x2={image?.naturalWidth || 1000} y2={y}
                  stroke="rgba(0,255,255,0.6)" strokeWidth={stroke} />
          </React.Fragment>
        );
      })}
      {/* current crop rect (fractions) */}
      {fractions && (
        <rect
          x={(image?.naturalWidth || 1000) * (fractions.left || 0)}
          y={(image?.naturalHeight || 1000) * (fractions.top || 0)}
          width={(image?.naturalWidth || 1000) * (fractions.width || 1)}
          height={(image?.naturalHeight || 1000) * (fractions.height || 1)}
          fill="rgba(255,255,0,0.15)"
          stroke="rgba(255,255,0,0.9)"
          strokeWidth={stroke}
        />
      )}
    </svg>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "grid", placeItems: "center", zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        ref={containerRef}
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
            {image && <img src={image.src ?? image} alt="" draggable={false} />}
            {overlay}
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
