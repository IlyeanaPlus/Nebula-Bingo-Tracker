// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * GridTunerModal
 * - Green-only 5×5 crop grid (drawn on canvas)
 * - Centers on the image (after image load)
 * - Crosshair in the center cell is the ONLY move handle
 * - Resize from 4 corners, 1:1 aspect
 * - Grid is clamped to the image bounds
 * - Uses portal overlaying the whole app
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const [open, setOpen] = useState(true);
  const [imgReady, setImgReady] = useState(false);

  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const overlayRef = useRef(null); // canvas
  const boxRef = useRef(null);     // interactive square
  const puckRef = useRef(null);    // center crosshair handle

  const centeredOnceRef = useRef(false);

  // Fractions {x,y,w,h} in [0..1]. w==h.
  const centerFractions = (size = 0.6) => {
    const s = Math.max(0.05, Math.min(1, size));
    const c = (1 - s) / 2;
    return { x: c, y: c, w: s, h: s };
  };

  const normalizeInit = (fr) => {
    if (!fr) return centerFractions();
    const s = Math.min(fr.w ?? fr.h ?? 0.6, fr.h ?? fr.w ?? 0.6);
    const x = Math.max(0, Math.min(fr.x ?? 0.2, 1 - s));
    const y = Math.max(0, Math.min(fr.y ?? 0.2, 1 - s));
    return { x, y, w: s, h: s };
  };

  const [fractions, setFractions] = useState(normalizeInit(initialFractions));

  const getRects = () => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const imgRect  = img.getBoundingClientRect();
    return { wrapRect, imgRect, offsetX: imgRect.left - wrapRect.left, offsetY: imgRect.top - wrapRect.top };
  };

  const drawOverlay = () => {
    const cv = overlayRef.current;
    const rects = getRects();
    if (!cv || !rects) return;
    const { imgRect, offsetX, offsetY } = rects;

    // Place & size the canvas to exactly cover the displayed image area
    Object.assign(cv.style, {
      position: "absolute",
      left: `${offsetX}px`,
      top: `${offsetY}px`,
      width: `${imgRect.width}px`,
      height: `${imgRect.height}px`,
      pointerEvents: "none",
    });
    cv.width = imgRect.width;
    cv.height = imgRect.height;

    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);

    const x = fractions.x * imgRect.width;
    const y = fractions.y * imgRect.height;
    const s = fractions.w * imgRect.width;

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

    // Position interactive square box (relative to wrapper, so include offset)
    if (boxRef.current) {
      Object.assign(boxRef.current.style, {
        left: `${offsetX + x}px`,
        top: `${offsetY + y}px`,
        width: `${s}px`,
        height: `${s}px`,
        border: "2px solid rgba(34,197,94,0.95)",
        position: "absolute",
        pointerEvents: "none", // only handles are interactive
      });
    }

    // Position the center crosshair (the only move handle)
    if (puckRef.current) {
      const size = 22;
      Object.assign(puckRef.current.style, {
        left: `${offsetX + x + s / 2 - size / 2}px`,
        top: `${offsetY + y + s / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        position: "absolute",
        cursor: "crosshair",
        pointerEvents: "auto",
      });
    }
  };

  // Center AFTER the image is laid out
  const handleImageLoad = () => {
    setImgReady(true);
    if (!centeredOnceRef.current) {
      centeredOnceRef.current = true;
      setFractions(centerFractions(0.6));
    }
  };

  // Redraw on fractions/image changes and when ready
  useEffect(() => { if (imgReady) drawOverlay(); }, [fractions, imageSrc, imgReady]);

  // Track image size changes (contain/resize) and redraw
  useEffect(() => {
    if (!imgRef.current) return;
    const ro = new ResizeObserver(() => { if (imgReady) drawOverlay(); });
    ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [imgReady]);

  // --- Interaction helpers ---
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Move via center crosshair only
  const onPuckDown = (e) => {
    e.preventDefault();
    const rects = getRects(); if (!rects) return;
    const { imgRect } = rects;
    const startX = e.clientX, startY = e.clientY;
    const f0 = { ...fractions };

    const mm = (ev) => {
      const dx = (ev.clientX - startX) / imgRect.width;
      const dy = (ev.clientY - startY) / imgRect.height;
      let nx = f0.x + dx;
      let ny = f0.y + dy;
      nx = Math.max(0, Math.min(nx, 1 - f0.w));
      ny = Math.max(0, Math.min(ny, 1 - f0.h));
      setFractions({ ...f0, x: nx, y: ny });
    };
    const mu = () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  };

  // Resize from corners (1:1, clamped)
  const onResizeStart = (corner) => (e) => {
    e.preventDefault();
    const rects = getRects(); if (!rects) return;
    const { imgRect } = rects;
    const startX = e.clientX, startY = e.clientY;
    const f0 = { ...fractions };

    const mm = (ev) => {
      const dx = (ev.clientX - startX) / imgRect.width;
      const dy = (ev.clientY - startY) / imgRect.height;

      let ds = 0, nx = f0.x, ny = f0.y;
      if (corner === "se") ds = Math.max(dx, dy);
      if (corner === "nw") ds = -Math.max(-dx, -dy);
      if (corner === "ne") ds = Math.max(dx, -dy);
      if (corner === "sw") ds = Math.max(-dx, dy);

      let s = f0.w + ds;
      const minS = 32 / imgRect.width; // 32px minimum
      s = Math.max(minS, Math.min(1, s));

      if (corner === "nw") { nx = f0.x + (f0.w - s); ny = f0.y + (f0.h - s); }
      if (corner === "ne") { nx = f0.x;                ny = f0.y + (f0.h - s); }
      if (corner === "sw") { nx = f0.x + (f0.w - s); ny = f0.y; }
      if (corner === "se") { nx = f0.x;                ny = f0.y; }

      nx = Math.max(0, Math.min(nx, 1 - s));
      ny = Math.max(0, Math.min(ny, 1 - s));

      setFractions({ x: nx, y: ny, w: s, h: s });
    };
    const mu = () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  };

  const handleConfirm = () => onConfirm?.(fractions);
  const handleReset = () => setFractions(centerFractions(0.6));

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

        <div ref={wrapRef} style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="preview"
            onLoad={handleImageLoad}
            style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
          />
          <canvas ref={overlayRef} />

          {/* Interaction layer (positions are set in drawOverlay) */}
          <div ref={boxRef} />

          {/* Center crosshair = ONLY move handle */}
          <div
            ref={puckRef}
            onMouseDown={onPuckDown}
            title="Drag to move"
            style={{
              // visual crosshair
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
