// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * GridTunerModal (square 5x5)
 * - No outer/cyan frame. Single square overlay you can move and resize.
 * - Keeps 1:1 aspect at all times. Equal 5x5 lines (green).
 * - Returns fractions: { x, y, size } relative to image (0..1), plus cols/rows equal arrays.
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  // Fractions: x,y are top-left; size is square side; all in 0..1 relative to image dimension
  const [box, setBox] = useState(() => {
    if (initialFractions && typeof initialFractions === "object") {
      if ("x" in initialFractions && "y" in initialFractions && "size" in initialFractions) {
        return { x: initialFractions.x, y: initialFractions.y, size: initialFractions.size };
      }
      // Legacy: convert rect to centered square
      const left = initialFractions.left ?? 0;
      const top = initialFractions.top ?? 0;
      const right = initialFractions.right ?? 1;
      const bottom = initialFractions.bottom ?? 1;
      const w = Math.max(0.05, right - left);
      const h = Math.max(0.05, bottom - top);
      const side = Math.min(w, h);
      return { x: left, y: top, size: side };
    }
    return { x: 0.1, y: 0.1, size: 0.8 };
  });
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => { draw(); }, [img, box]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const dpr = window.devicePixelRatio || 1;
    const maxW = 860;
    const scale = Math.min(1, maxW / img.width);
    const W = Math.round(img.width * scale);
    const H = Math.round(img.height * scale);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    const x = box.x * W;
    const y = box.y * H;
    const side = box.size * Math.min(W, H);

    // shade outside
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, y);
    ctx.fillRect(0, y + side, W, H - (y + side));
    ctx.fillRect(0, y, x, side);
    ctx.fillRect(x + side, y, W - (x + side), side);

    // grid lines
    ctx.strokeStyle = "#00ffa6";
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(x + side * t, y);
      ctx.lineTo(x + side * t, y + side);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + side * t);
      ctx.lineTo(x + side, y + side * t);
      ctx.stroke();
    }

    // handles
    ctx.fillStyle = "#00ffa6";
    const hs = 6;
    const pts = [
      [x, y], [x + side / 2, y], [x + side, y],
      [x, y + side / 2], [x + side, y + side / 2],
      [x, y + side], [x + side / 2, y + side], [x + side, y + side],
    ];
    for (const [hx, hy] of pts) {
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    }
    ctx.restore();
  }

  function hitTest(mx, my, W, H) {
    const x = box.x * W;
    const y = box.y * H;
    const side = box.size * Math.min(W, H);
    const tol = 10;
    if (mx >= x && mx <= x + side && my >= y && my <= y + side) return "move";
    return null;
  }

  function onPointerDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mode = hitTest(mx, my, rect.width, rect.height);
    if (!mode) return;
    setDrag({ mode, ox: mx, oy: my, obox: { ...box } });
  }

  function onPointerMove(e) {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - drag.ox;
    const dy = my - drag.oy;
    const W = rect.width;
    const H = rect.height;
    setBox(() => {
      let { x, y, size } = drag.obox;
      if (drag.mode === "move") {
        const nx = (x * W + dx) / W;
        const ny = (y * H + dy) / H;
        x = Math.max(0, Math.min(1 - size, nx));
        y = Math.max(0, Math.min(1 - size, ny));
      }
      return { x, y, size };
    });
  }

  function onPointerUp() { setDrag(null); }

  function equalArray(n) {
    return Array.from({ length: n + 1 }, (_, i) => i / n);
  }

  function confirm() {
    const fractions = {
      top: box.y,
      left: box.x,
      right: box.x + box.size,
      bottom: box.y + box.size,
      cols: equalArray(5),
      rows: equalArray(5),
      x: box.x, y: box.y, size: box.size
    };
    onConfirm?.(fractions);
  }

  return (
    <div className="nbt-modal-backdrop">
      <div className="nbt-modal">
        <div className="nbt-modal-header">
          <h3>Grid Tuner</h3>
          <div className="spacer" />
          <button className="nbt-btn subtle" onClick={() => setBox({ x: 0.1, y: 0.1, size: 0.8 })}>Reset</button>
          <button className="nbt-btn" onClick={confirm}>Confirm</button>
          <button className="nbt-btn ghost" onClick={onCancel}>Cancel</button>
        </div>
        <div className="nbt-modal-body">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ borderRadius: 8, cursor: "crosshair", background: "#111" }}
          />
        </div>
        <div className="nbt-modal-footer">
          <small>Drag the square to move or resize. The 5×5 grid is always equal-sized and square.</small>
        </div>
      </div>
    </div>
  );
}
