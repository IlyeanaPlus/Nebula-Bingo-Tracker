// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * GridTunerModal
 * - Green-only 5×5 crop grid
 * - Center dot is the ONLY move handle (crosshair cursor)
 * - Resizable from all 4 corners, locked 1:1
 * - Always clamped to the image bounds
 * - Overlays the whole app (portal to document.body)
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const [open, setOpen] = useState(true);
  const imgRef = useRef(null);
  const overlayRef = useRef(null);
  const boxRef = useRef(null);
  const puckRef = useRef(null);

  function normalizeInit(fr) {
    const f = fr || { x: 0.1, y: 0.1, w: 0.6, h: 0.6 };
    const s = Math.min(f.w ?? 0.6, f.h ?? 0.6);
    const cx = (1 - s) / 2;
    const cy = (1 - s) / 2;
    const x = fr ? Math.min(Math.max(f.x ?? cx, 0), 1 - s) : cx;
    const y = fr ? Math.min(Math.max(f.y ?? cy, 0), 1 - s) : cy;
    return { x, y, w: s, h: s };
  }

  const initRef = useRef(normalizeInit(initialFractions));
  const [fractions, setFractions] = useState(initRef.current);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") { setOpen(false); onCancel?.(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => { drawOverlay(); }, [fractions, imageSrc]);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function drawOverlay(){
    const cv = overlayRef.current; if (!cv) return;
    const img = imgRef.current; if (!img) return;
    const rect = img.getBoundingClientRect();
    cv.width = rect.width; cv.height = rect.height;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);

    const x = fractions.x * rect.width;
    const y = fractions.y * rect.height;
    const s = fractions.w * rect.width;

    // Dim outside crop
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0,0,cv.width,cv.height);
    ctx.clearRect(x, y, s, s);
    ctx.restore();

    // Outer border
    ctx.save();
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s, s);

    // 5×5 grid
    ctx.strokeStyle = "rgba(34,197,94,0.85)";
    ctx.lineWidth = 1;
    const step = s/5;
    for (let i=1;i<5;i++){
      const gx = Math.round(x + i*step) + 0.5;
      const gy = Math.round(y + i*step) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y+s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x+s, gy); ctx.stroke();
    }
    ctx.restore();

    // Sync overlay box
    if (boxRef.current) {
      Object.assign(boxRef.current.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${s}px`,
        height: `${s}px`,
        border: "2px solid rgba(34,197,94,0.95)",
      });
    }

    // Center puck position
    if (puckRef.current) {
      const size = 16;
      Object.assign(puckRef.current.style, {
        left: `${x + s/2 - size/2}px`,
        top: `${y + s/2 - size/2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
    }
  }

  // Move via center puck only
  function handlePuckDragStart(e){
    const rect = imgRef.current.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const f0 = { ...fractions };

    function mm(ev){
      const dx = (ev.clientX - startX)/rect.width;
      const dy = (ev.clientY - startY)/rect.height;
      let nx = clamp01(f0.x + dx);
      let ny = clamp01(f0.y + dy);
      nx = Math.min(nx, 1 - f0.w);
      ny = Math.min(ny, 1 - f0.h);
      setFractions({ ...f0, x: nx, y: ny });
    }
    function mu(){ window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  }

  // Resize from corners
  function onResizeStart(corner){
    return function(e){
      const rect = imgRef.current.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const f0 = { ...fractions };

      function mm(ev){
        const dx = (ev.clientX - startX)/rect.width;
        const dy = (ev.clientY - startY)/rect.height;
        let ds = 0, nx=f0.x, ny=f0.y;
        if (corner==='se') ds = Math.max(dx, dy);
        if (corner==='nw') ds = -Math.max(-dx, -dy);
        if (corner==='ne') ds = Math.max(dx, -dy);
        if (corner==='sw') ds = Math.max(-dx, dy);

        let s = f0.w + ds;
        const minS = 32/rect.width;
        s = Math.max(minS, s);
        s = Math.min(s, 1);

        if (corner==='nw'){ nx = Math.max(0, f0.x + (f0.w - s)); ny = Math.max(0, f0.y + (f0.h - s)); }
        if (corner==='ne'){ ny = Math.max(0, f0.y + (f0.h - s)); nx = f0.x; }
        if (corner==='sw'){ nx = Math.max(0, f0.x + (f0.w - s)); ny = f0.y; }
        if (corner==='se'){ nx = f0.x; ny = f0.y; }

        nx = clamp01(nx); ny = clamp01(ny);
        s  = Math.min(s, 1 - nx);
        s  = Math.min(s, 1 - ny);

        setFractions({ x:nx, y:ny, w:s, h:s });
      }
      function mu(){ window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }
      window.addEventListener("mousemove", mm);
      window.addEventListener("mouseup", mu);
    };
  }

  function handleConfirm(){ onConfirm?.(fractions); }
  function handleReset(){ setFractions(normalizeInit(initialFractions)); }

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

        <div style={{ position:"relative", display:"grid", placeItems:"center" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="preview"
            style={{ maxWidth:"100%", maxHeight:"60vh", objectFit:"contain" }}
          />
          <canvas ref={overlayRef} style={{ position:"absolute", inset:0, pointerEvents:"none" }} />

          {/* Overlay */}
          <div ref={boxRef} style={{ position:"absolute" }}>
            {/* Center puck: move handle */}
            <div
              ref={puckRef}
              onMouseDown={handlePuckDragStart}
              title="Drag to move"
              style={{
                position:'absolute',
                background:'#22c55e',
                borderRadius:'50%',
                boxShadow:'0 0 0 2px #111, 0 0 0 4px rgba(34,197,94,0.75)',
                cursor:'crosshair',
              }}
            />

            {/* Corner resize handles */}
            <div onMouseDown={onResizeStart('nw')}
              style={{ position:'absolute', width:12, height:12, left:-6, top:-6, background:'#22c55e', borderRadius:6, cursor:'nwse-resize' }} />
            <div onMouseDown={onResizeStart('ne')}
              style={{ position:'absolute', width:12, height:12, right:-6, top:-6, background:'#22c55e', borderRadius:6, cursor:'nesw-resize' }} />
            <div onMouseDown={onResizeStart('sw')}
              style={{ position:'absolute', width:12, height:12, left:-6, bottom:-6, background:'#22c55e', borderRadius:6, cursor:'nesw-resize' }} />
            <div onMouseDown={onResizeStart('se')}
              style={{ position:'absolute', width:12, height:12, right:-6, bottom:-6, background:'#22c55e', borderRadius:6, cursor:'nwse-resize' }} />
          </div>
        </div>

        <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end" }}>
          <button className="btn" onClick={handleReset}>Reset</button>
          <button className="btn" onClick={() => { setOpen(false); onCancel?.(); }}>Cancel</button>
          <button className="btn" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
