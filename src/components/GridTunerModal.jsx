// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * Props:
 * - imageSrc: string (objectURL/file/url)
 * - initialFractions: { x, y, w, h } in 0..1 coords
 * - onConfirm(fractions)
 * - onCancel()
 *
 * Behavior:
 * - Green 5x5 overlay grid locked to 1:1 aspect.
 * - Drag inside to move; drag corners to resize maintaining square.
 * - Confirm returns {x,y,w,h} in 0..1 relative to image, ready for computeCrops25.
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const [open, setOpen] = useState(true);
  const imgRef = useRef(null);
  const boxRef = useRef(null);

  // fractions (0..1) for x,y,w,h — w==h to keep 1:1
  const [fr, setFr] = useState(() => {
    const f = initialFractions || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const s = Math.min(f.w, f.h);
    return { x: f.x, y: f.y, w: s, h: s };
  });

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { setOpen(false); onCancel?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (!open) return null;

  // convert fractions to pixel rect over displayed image size
  function fracToRect() {
    const img = imgRef.current;
    if (!img) return { left: 0, top: 0, size: 100 };
    const W = img.clientWidth;
    const H = img.clientHeight;
    const size = Math.round(Math.min(W, H) * fr.w); // w==h
    const left = Math.round(fr.x * W);
    const top = Math.round(fr.y * H);
    return { left, top, size };
  }

  function clampFr(n) { return Math.max(0, Math.min(1, n)); }

  // drag move
  function onDragStart(e) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...fr };
    function move(ev) {
      const dx = (ev.clientX - startX);
      const dy = (ev.clientY - startY);
      const img = imgRef.current;
      const W = img.clientWidth;
      const H = img.clientHeight;
      const nx = clampFr(start.x + dx / W);
      const ny = clampFr(start.y + dy / H);
      setFr(f => ({ ...f, x: nx, y: ny }));
    }
    function up() { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // resize from corner (keeps 1:1)
  function onResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = { ...fr };
    function move(ev) {
      const img = imgRef.current;
      const W = img.clientWidth;
      const delta = (ev.clientX - startX) / W; // horizontal drag controls size
      const s = clampFr(Math.max(0.05, Math.min(1, start.w + delta)));
      setFr(f => ({ ...f, w: s, h: s }));
    }
    function up() { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function handleConfirm() {
    // ensure clamp inside [0,1] and square
    const f = { ...fr };
    const s = Math.min(f.w, f.h);
    const nx = clampFr(f.x);
    const ny = clampFr(f.y);
    const nw = clampFr(s);
    const nh = clampFr(s);
    setOpen(false);
    onConfirm?.({ x: nx, y: ny, w: nw, h: nh });
  }

  const rect = fracToRect();

  const modal = (
    <div className="fill-overlay" role="dialog" aria-modal="true">
      <div className="fill-box" style={{ width: "min(980px, 90vw)" }}>
        <div className="fill-title">Grid Tuner</div>
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#0e0e0e" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="grid-source"
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
          {/* draggable, resizable square */}
          <div
            ref={boxRef}
            onMouseDown={onDragStart}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.size,
              height: rect.size,
              outline: "2px solid rgba(0,255,0,.6)", // green outline
              boxShadow: "0 0 0 9999px rgba(0,0,0,.35)",
              cursor: "move",
            }}
            aria-label="grid selection"
          >
            {/* 5x5 inner grid */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: "repeat(5,1fr)",
                gridTemplateRows: "repeat(5,1fr)",
              }}
            >
              {Array.from({ length: 25 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid rgba(0,255,0,.55)", // green gridlines
                    boxSizing: "border-box",
                  }}
                />
              ))}
            </div>

            {/* corner handle (keeps 1:1) */}
            <div
              onMouseDown={onResizeStart}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                width: 14,
                height: 14,
                borderRadius: 3,
                border: "1px solid #0f0",
                background: "rgba(0,255,0,.25)",
                cursor: "nwse-resize",
              }}
              title="Drag to resize (1:1)"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => { setOpen(false); onCancel?.(); }}>Cancel</button>
          <button className="btn" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
