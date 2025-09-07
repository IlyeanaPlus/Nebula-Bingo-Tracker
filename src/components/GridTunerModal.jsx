// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * GridTunerModal
 * - Green-only 5×5 crop grid
 * - Always starts centered on the image (after image load)
 * - Move via CENTER CROSSHAIR ONLY
 * - Resize from all 4 corners, locked 1:1
 * - Clamp to image bounds
 * - Overlays whole app (portal to document.body)
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const [open, setOpen] = useState(true);
  const [imgReady, setImgReady] = useState(false);

  const imgRef = useRef(null);
  const overlayRef = useRef(null);
  const boxRef = useRef(null);
  const puckRef = useRef(null);

  // --- Fractions state: {x,y,w,h} in [0..1], w==h ---
  function centerFractions(size = 0.6) {
    const s = Math.max(0.05, Math.min(1, size));
    const c = (1 - s) / 2;
    return { x: c, y: c, w: s, h: s };
  }

  function normalizeInit(fr) {
    if (!fr) return centerFractions();
    const s = Math.min(fr.w ?? fr.h ?? 0.6, fr.h ?? fr.w ?? 0.6);
    const x = Math.max(0, Math.min(fr.x ?? 0.2, 1 - s));
    const y = Math.max(0, Math.min(fr.y ?? 0.2, 1 - s));
    return { x, y, w: s, h: s };
  }

  const [fractions, setFractions] = useState(normalizeInit(initialFractions));

  // Center after image load (author intent: “always start in the center of the image”)
  function handleImageLoad() {
    setImgReady(true);
    // Always center on actual image load; keep your preferred default size (0.6)
    setFractions(centerFractions(0.6));
  }

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") { setOpen(false); onCancel?.(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => { if (imgReady) drawOverlay(); }, [fractions, imageSrc, imgReady]);

  function getImgRect() {
    const img = imgRef.current;
    if (!img) return null;
    return img.getBoundingClientRect();
  }

  function drawOverlay() {
    const cv = overlayRef.current; if (!cv) return;
    const rect = getImgRect(); if (!rect || rect.width === 0 || rect.height === 0) return;

    // Size the canvas to the displayed image box
    cv.width = rect.width;
    cv.height = rect.height;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);

    const x = fractions.x * rect.width;
    const y = fractions.y * rect.height;
    const s = fractions.w * rect.width;

    // Dim outside crop
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.clearRect(x, y, s, s);
    ctx.restore();

    // Outer border (green)
    ctx.save();
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s, s);

    // 5×5 grid (green, thinner)
    ctx.strokeStyle = "rgba(34,197,94,0.85)";
    ctx.lineWidth = 1;
    const step = s / 5;
    for (let i = 1; i < 5; i++) {
      const gx = Math.round(x + i * step) + 0.5;
      const gy = Math.round(y + i * step) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + s, gy); ctx.stroke();
    }
    ctx.restore();

    // Sync overlay box (absolute inside the same relative wrapper)
    if (boxRef.current) {
      Object.assign(boxRef.current.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${s}px`,
        height: `${s}px`,
        border: "2px solid rgba(34,197,94,0.95)",
        pointerEvents: "none", // only handles are interactive
      });
    }

    // Crosshair puck in the exact center (interactive)
    if (puckRef.current) {
      const size = 22; // touch-friendly
      Object.assign(puckRef.current.style, {
        left: `${x + s / 2 - size / 2}px`,
        top: `${y + s / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
    }
  }

  // --- Move via center crosshair only ---
  function onPuckDown(e) {
    e.preventDefault();
    const rect = getImgRect(); if (!rect) return;

    const startX = e.clientX, startY = e.clientY;
    const f0 = { ...fractions };

    function mm(ev) {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      let nx = f0.x + dx;
      let ny = f0.y + dy;
      // clamp to image bounds
      nx = Math.max(0, Math.min(nx, 1 - f0.w));
      ny = Math.max(0, Math.min(ny, 1 - f0.h));
      setFractions({ ...f0, x: nx, y: ny });
    }
    function mu() { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }

    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  }

  // --- Resize from corners (1:1, clamped) ---
  function onResizeStart(corner) {
    return function (e) {
      e.preventDefault();
      const rect = getImgRect(); if (!rect) return;
      const startX = e.clientX, startY = e.clientY;
      const f0 = { ...fractions };

      function mm(ev) {
        const dx = (ev.clientX - startX) / rect.width;
        const dy = (ev.clientY - startY) / rect.height;

        let ds = 0, nx = f0.x, ny = f0.y;
        if (corner === "se") ds = Math.max(dx, dy);
        if (corner === "nw") ds = -Math.max(-dx, -dy);
        if (corner === "ne") ds = Math.max(dx, -dy);
        if (corner === "sw") ds = Math.max(-dx, dy);

        let s = f0.w + ds;
        const minS = 32 / rect.width; // 32px min size
        s = Math.max(minS, Math.min(1, s));

        if (corner === "nw") { nx = f0.x + (f0.w - s); ny = f0.y + (f0.h - s); }
        if (corner === "ne") { nx = f0.x;                ny = f0.y + (f0.h - s); }
        if (corner === "sw") { nx = f0.x + (f0.w - s); ny = f0.y; }
        if (corner === "se") { nx = f0.x;                ny = f0.y; }

        // clamp square fully inside image
        nx = Math.max(0, Math.min(nx, 1 - s));
        ny = Math.max(0, Math.min(ny, 1 - s));

        setFractions({ x: nx, y: ny, w: s, h: s });
      }
      function mu() { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }
      window.addEventListener("mousemove", mm);
      window.addEventListener("mouseup", mu);
    };
  }

  function handleConfirm() { onConfirm?.(fractions); }
  function handleReset()   { setFractions(centerFractions(0.6)); }

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483647,
      }}
    >
      <div
        role="dialog"
        aria-modal
        style={{
          background: "#111",
          color: "#eee",
          borderRadius: 12,
          padding: 16,
          maxWidth: 900,
          width: "95vw",
          boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 8 }}>Grid Tuner</div>

        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="preview"
            onLoad={handleImageLoad}
            style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
          />
          {/* Drawn grid + dim areas */}
          <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

          {/* Absolute interaction layer, aligned to the image via drawOverlay() */}
          <div ref={boxRef} style={{ position: "absolute" }}>
            {/* Center crosshair = ONLY move handle */}
            <div
              ref={puckRef}
              onMouseDown={onPuckDown}
              title="Drag to move"
              style={{
                position: "absolute",
                cursor: "crosshair",
                pointerEvents: "auto",
                // visual crosshair (two green bars)
                background: "transparent",
                borderRadius: "50%",
                boxShadow: "0 0 0 2px #111, 0 0 0 4px rgba(34,197,94,0.6)",
              }}
            >
              {/* Horizontal line */}
              <div style={{
                position: "absolute", left: 2, right: 2, top: "50%", height: 2,
                transform: "translateY(-50%)", background: "#22c55e",
              }} />
              {/* Vertical line */}
              <div style={{
                position: "absolute", top: 2, bottom: 2, left: "50%", width: 2,
                transform: "translateX(-50%)", background: "#22c55e",
              }} />
            </div>

            {/* Corner resize handles */}
            <div onMouseDown={onResizeStart("nw")}
              style={{ position: "absolute", width: 12, height: 12, left: -6, top: -6,
                       background: "#22c55e", borderRadius: 6, cursor: "nwse-resize" }} />
            <div onMouseDown={onResizeStart("ne")}
              style={{ position: "absolute", width: 12, height: 12, right: -6, top: -6,
                       background: "#22c55e", borderRadius: 6, cursor: "nesw-resize" }} />
            <div onMouseDown={onResizeStart("sw")}
              style={{ position: "absolute", width: 12, height: 12, left: -6, bottom: -6,
                       background: "#22c55e", borderRadius: 6, cursor: "nesw-resize" }} />
            <div onMouseDown={onResizeStart("se")}
              style={{ position: "absolute", width: 12, height: 12, right: -6, bottom: -6,
                       background: "#22c55e", borderRadius: 6, cursor: "nwse-resize" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button className="btn" onClick={handleReset}>Reset</button>
          <button className="btn" onClick={() => { setOpen(false); onCancel?.(); }}>Cancel</button>
          <button className="btn" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
