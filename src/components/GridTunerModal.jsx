// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

/**
 * GridTunerModal
 * - Green-only 5×5 crop grid
 * - Draggable **center handle** (not whole box)
 * - Resizable from all 4 corners, locked 1:1
 * - Clamped to the image bounds
 * - Centered overlay above the entire app (portal to document.body)
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const [open, setOpen] = useState(true);
  const imgRef = useRef(null);
  const overlayRef = useRef(null);
  const boxRef = useRef(null);
  const centerHandleRef = useRef(null);

  function normalizeInit(fr) {
    const f = fr || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const s = Math.min(f.w ?? 0.8, f.h ?? 0.8);
    const nx = Math.min(f.x ?? 0.1, 1 - s);
    const ny = Math.min(f.y ?? 0.1, 1 - s);
    return { x: Math.max(0, nx), y: Math.max(0, ny), w: s, h: s };
  }

  const initRef = useRef(normalizeInit(initialFractions));
  const [fractions, setFractions] = useState(initRef.current);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") { setOpen(false); onCancel?.(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => { drawOverlay(); }, [fractions, imageSrc]);

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

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

    // Outer border (green)
    ctx.save();
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s, s);

    // 5×5 grid (green, thinner)
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

    // Sync interactive drag box overlay
    if (boxRef.current) {
      Object.assign(boxRef.current.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${s}px`,
        height: `${s}px`,
        border: "2px solid rgba(34,197,94,0.95)",
      });
    }

    // Center move handle position
    if (centerHandleRef.current) {
      const size = 18;
      Object.assign(centerHandleRef.current.style, {
        left: `${x + s/2 - size/2}px`,
        top: `${y + s/2 - size/2}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
    }
  }

  // --- Move via center handle only ---
  function handleCenterDragStart(e){
    const rect = imgRef.current.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const f0 = { ...fractions };

    function mm(ev){
      const dx = (ev.clientX - startX)/rect.width;
      const dy = (ev.clientY - startY)/rect.height;
      // clamp inside: keep whole square in bounds
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

  // --- Resize from corners (keeps 1:1 & clamps to image) ---
  function onResizeStart(corner){
    return function(e){
      const rect = imgRef.current.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const f0 = { ...fractions };

      function mm(ev){
        const dx = (ev.clientX - startX)/rect.width;
        const dy = (ev.clientY - startY)/rect.height;

        // propose delta in square space
        let ds = 0, nx=f0.x, ny=f0.y;
        if (corner==='se') ds = Math.max(dx, dy);
        if (corner==='nw') ds = -Math.max(-dx, -dy);
        if (corner==='ne') ds = Math.max(dx, -dy);
        if (corner==='sw') ds = Math.max(-dx, dy);

        // base new size
        let s = f0.w + ds;
        const minS = 32/rect.width;          // absolute min in pixels (32)
        s = Math.max(minS, s);
        s = Math.min(s, 1);

        // reposition for corners opposite to SE
        if (corner==='nw'){ nx = Math.max(0, f0.x + (f0.w - s)); ny = Math.max(0, f0.y + (f0.h - s)); }
        if (corner==='ne'){ ny = Math.max(0, f0.y + (f0.h - s)); nx = f0.x; }
        if (corner==='sw'){ nx = Math.max(0, f0.x + (f0.w - s)); ny = f0.y; }
        if (corner==='se'){ nx = f0.x; ny = f0.y; }

        // clamp so square stays fully inside image
        nx = clamp01(nx); ny = clamp01(ny);
        s  = Math.min(s, 1 - nx);           // right bound
        s  = Math.min(s, 1 - ny);           // bottom bound

        setFractions({ x:nx, y:ny, w:s, h:s });
      }
      function mu(){ window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }
      window.addEventListener("mousemove", mm);
      window.addEventListener("mouseup", mu);
    };
  }

  function handleConfirm(){ onConfirm?.(fractions); }
  function handleReset(){ setFractions(initRef.current); }

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      className="modal-backdrop"
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
        className="modal-window"
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
        <div className="modal-title" style={{ fontSize: 18, marginBottom: 8 }}>Grid Tuner</div>

        <div style={{ position:"relative", display:"grid", placeItems:"center" }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="preview"
            style={{ maxWidth:"100%", maxHeight:"60vh", objectFit:"contain" }}
          />
          <canvas ref={overlayRef} style={{ position:"absolute", inset:0, pointerEvents:"none" }} />

          {/* Interactive overlay (no drag on box; only center + corners) */}
          <div ref={boxRef} style={{ position:"absolute", pointerEvents:"none" }}>
            {/* Center move handle */}
            <div
              ref={centerHandleRef}
              onMouseDown={handleCenterDragStart}
              title="Drag to move"
              style={{
                position:'absolute',
                background:'#22c55e',
                borderRadius:999,
                boxShadow:'0 0 0 2px #111, 0 0 0 4px rgba(34,197,94,0.75)',
                cursor:'move',
                pointerEvents:'auto', // allow interaction
              }}
            />

            {/* Corner resize handles */}
            <div title="Resize" onMouseDown={onResizeStart('nw')}
              style={{ position:'absolute', width:12, height:12, left:-6, top:-6, background:'#22c55e', borderRadius:6, cursor:'nwse-resize', pointerEvents:'auto' }} />
            <div title="Resize" onMouseDown={onResizeStart('ne')}
              style={{ position:'absolute', width:12, height:12, right:-6, top:-6, background:'#22c55e', borderRadius:6, cursor:'nesw-resize', pointerEvents:'auto' }} />
            <div title="Resize" onMouseDown={onResizeStart('sw')}
              style={{ position:'absolute', width:12, height:12, left:-6, bottom:-6, background:'#22c55e', borderRadius:6, cursor:'nesw-resize', pointerEvents:'auto' }} />
            <div title="Resize" onMouseDown={onResizeStart('se')}
              style={{ position:'absolute', width:12, height:12, right:-6, bottom:-6, background:'#22c55e', borderRadius:6, cursor:'nwse-resize', pointerEvents:'auto' }} />
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
