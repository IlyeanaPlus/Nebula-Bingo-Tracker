// src/components/GridTunerModal.jsx
// Single, canonical Grid Tuner modal with the legacy interaction behavior.
// Opens via:  window.__NBT_GRID.open({ canvas, frac? })
// Returns:    { frac: { left,right,top,bottom, cols:5, rows:5 } }

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const LS_KEY = "nbt.gridFractions";
const MAX_CANVAS = 520;
const GRID_GREEN = "#00FF00"; // pure green
const GRID_W = 2;
const HANDLE = 18;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }

function Handle({ x, y, cursor, onPointerDown }) {
  const s = HANDLE, h = s / 2;
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: x - h,
        top: y - h,
        width: s,
        height: s,
        background: GRID_GREEN,
        border: "2px solid rgba(0,0,0,0.85)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.95)",
        borderRadius: 2,
        cursor,
        touchAction: "none",
      }}
    />
  );
}

function GridTunerModal({ req, onResolve, onReject }) {
  const [open, setOpen] = useState(!!req);
  const [img, setImg] = useState(null);
  const [cx, setCx] = useState(0.5);     // center in image fraction
  const [cy, setCy] = useState(0.5);
  const [half, setHalf] = useState(0.35);// half-size as fraction of min(W,H)

  const canvasRef = useRef(null);
  const wrapRef   = useRef(null);
  const dragRef   = useRef(null); // {mode:"move"|"corner", start:{cx,cy,half}, startPx:{x,y}}

  // Initialize from request
  useEffect(() => {
    if (!req?.canvas) return;
    const c = req.canvas;
    const image = new Image();
    image.onload = () => {
      setImg(image);
      if (req.frac) {
        const L = clamp01(req.frac.left), T = clamp01(req.frac.top), R = clamp01(req.frac.right), B = clamp01(req.frac.bottom);
        setCx((L + R) / 2);
        setCy((T + B) / 2);
        setHalf(Math.max(R - L, B - T) / 2);
      }
      setOpen(true);
    };
    image.src = c.toDataURL("image/png");
  }, [req]);

  // Draw background + grid
  useEffect(() => {
    if (!open || !img) return;
    const c = canvasRef.current;
    const g = c.getContext("2d");
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_CANVAS / Math.max(W, H));
    c.width  = Math.round(W * scale);
    c.height = Math.round(H * scale);

    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, W, H, 0, 0, c.width, c.height);

    // square
    const minWH = Math.min(W, H);
    const halfPx = half * minWH * scale;
    const cxPx = cx * W * scale, cyPx = cy * H * scale;
    const L = cxPx - halfPx, T = cyPx - halfPx, R = cxPx + halfPx, B = cyPx + halfPx;

    // dim outside
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, 0, c.width, T);
    g.fillRect(0, B, c.width, c.height - B);
    g.fillRect(0, T, L, B - T);
    g.fillRect(R, T, c.width - R, B - T);

    // grid
    g.lineWidth = GRID_W;
    g.strokeStyle = GRID_GREEN;
    g.strokeRect(L, T, R - L, B - T);
    const dx = (R - L) / 5, dy = (B - T) / 5;
    for (let i = 1; i < 5; i++) { const x = L + i * dx; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); }
    for (let j = 1; j < 5; j++) { const y = T + j * dy; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }

    // sync overlay box size
    if (wrapRef.current) {
      wrapRef.current.style.width = c.width + "px";
      wrapRef.current.style.height = c.height + "px";
    }
  }, [open, img, cx, cy, half]);

  // Global drag listeners
  useEffect(() => {
    if (!open) return;
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag || !img) return;

      const c = canvasRef.current;
      const rect = c.getBoundingClientRect();
      const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const W = img.naturalWidth || img.width;
      const H = img.naturalHeight || img.height;
      const minWH = Math.min(W, H);
      const scale = Math.min(1, MAX_CANVAS / Math.max(W, H));

      if (drag.mode === "move") {
        const dx = (px.x - drag.startPx.x) / (W * scale);
        const dy = (px.y - drag.startPx.y) / (H * scale);
        const nCx = clamp(drag.start.cx + dx, (drag.start.half * minWH) / W, 1 - (drag.start.half * minWH) / W);
        const nCy = clamp(drag.start.cy + dy, (drag.start.half * minWH) / H, 1 - (drag.start.half * minWH) / H);
        setCx(nCx); setCy(nCy);
      } else if (drag.mode === "corner") {
        const centerPx = { x: drag.start.cx * W * scale, y: drag.start.cy * H * scale };
        const vx = Math.abs(px.x - centerPx.x);
        const vy = Math.abs(px.y - centerPx.y);
        const halfCanvas = Math.max(vx, vy);
        const halfImg = halfCanvas / (minWH * scale);
        const maxHalfX = Math.min(drag.start.cx, 1 - drag.start.cx) * (W / minWH);
        const maxHalfY = Math.min(drag.start.cy, 1 - drag.start.cy) * (H / minWH);
        setHalf(clamp(halfImg, 0.02, Math.min(maxHalfX, maxHalfY)));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open, img]);

  function beginDrag(e, mode) {
    if (!img) return;
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_CANVAS / Math.max(W, H));
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragRef.current = { mode, start: { cx, cy, half }, startPx: px };
    e.preventDefault();
  }

  function onCancel() {
    setOpen(false);
    onReject?.(new Error("cancelled"));
  }
  function onConfirm() {
    if (!img) return onCancel();
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const minWH = Math.min(W, H);
    const halfX = (half * minWH) / W;
    const halfY = (half * minWH) / H;
    const frac = {
      left: clamp01(cx - halfX),
      right: clamp01(cx + halfX),
      top: clamp01(cy - halfY),
      bottom: clamp01(cy + halfY),
      cols: 5, rows: 5,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(frac)); } catch {}
    setOpen(false);
    onResolve?.({ frac });
  }

  if (!open) return null;

  // Overlay positions (in canvas CSS pixels)
  const overlayPos = (() => {
    if (!img || !canvasRef.current) return null;
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_CANVAS / Math.max(W, H));
    const minWH = Math.min(W, H);
    const halfPx = half * minWH * scale;
    const cxPx = cx * W * scale, cyPx = cy * H * scale;
    const L = cxPx - halfPx, T = cyPx - halfPx, R = cxPx + halfPx, B = cyPx + halfPx;
    const dx = (R - L) / 5, dy = (B - T) / 5;
    return { L, T, R, B, dx, dy };
  })();

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="Grid Tuner">
      <div style={modal}>
        <h3 style={{ margin: 0 }}>Grid Tuner</h3>
        <p style={{ margin: "0 0 8px", opacity: 0.8, fontSize: 12 }}>
          Drag the <strong>center cell</strong> to reposition; drag the <strong>corner squares</strong> to resize. Grid is fixed 5×5 (square).
        </p>

        <div ref={wrapRef} style={{ position: "relative", width: "100%", maxWidth: MAX_CANVAS, margin: "0 auto" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block", border: "1px solid #2a2a2a", borderRadius: 8, background: "#000" }} />
          {overlayPos && (
            <>
              {/* Corner handles – on OUTER corners */}
              <Handle x={overlayPos.L} y={overlayPos.T} cursor="nwse-resize" onPointerDown={(e)=>beginDrag(e,"corner")} />
              <Handle x={overlayPos.R} y={overlayPos.T} cursor="nesw-resize" onPointerDown={(e)=>beginDrag(e,"corner")} />
              <Handle x={overlayPos.L} y={overlayPos.B} cursor="nesw-resize" onPointerDown={(e)=>beginDrag(e,"corner")} />
              <Handle x={overlayPos.R} y={overlayPos.B} cursor="nwse-resize" onPointerDown={(e)=>beginDrag(e,"corner")} />
              {/* Center-cell mover (cell 13) */}
              <div
                onPointerDown={(e)=>beginDrag(e,"move")}
                style={{
                  position: "absolute",
                  left: overlayPos.L + 2 * overlayPos.dx,
                  top: overlayPos.T + 2 * overlayPos.dy,
                  width: overlayPos.dx,
                  height: overlayPos.dy,
                  cursor: "move",
                  outline: "none",
                }}
              />
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

const backdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000 };
const modal = { width: "min(720px, 92vw)", maxHeight: "90vh", overflow: "auto", display: "grid", gap: 12, padding: 14, borderRadius: 12, background: "var(--panel-bg,#151515)", border: "1px solid #2a2a2a" };

// ---------- Singleton portal + public API ----------
function ensureHost() {
  let host = document.getElementById("nbt-gridtuner-root");
  if (!host) {
    host = document.createElement("div");
    host.id = "nbt-gridtuner-root";
    document.body.appendChild(host);
  }
  return host;
}

function Portal() {
  const [req, setReq] = useState(null);
  const resolver = useRef({});

  useEffect(() => {
    window.__NBT_GRID = {
      open(detail) {
        return new Promise((resolve, reject) => {
          resolver.current = { resolve, reject };
          setReq(detail);
        });
      }
    };
    return () => { delete window.__NBT_GRID; };
  }, []);

  const handleResolve = (v) => { resolver.current.resolve?.(v); setReq(null); };
  const handleReject  = (e) => { resolver.current.reject?.(e);  setReq(null); };

  if (!req) return null;
  return <GridTunerModal req={req} onResolve={handleResolve} onReject={handleReject} />;
}

(function mountOnce() {
  const host = ensureHost();
  if (!host.__nbt_grid_root) {
    host.__nbt_grid_root = createRoot(host);
    host.__nbt_grid_root.render(<Portal />);
  }
})();
export default null;
