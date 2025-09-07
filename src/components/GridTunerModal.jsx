// src/components/GridTunerModal.jsx
import React, { useEffect, useRef, useState } from "react";

export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [box, setBox] = useState(() => {
    // prefer compact square form if provided
    if (initialFractions && "x" in initialFractions && "y" in initialFractions && "size" in initialFractions) {
      return { x: initialFractions.x, y: initialFractions.y, size: initialFractions.size };
    }
    // fallback: convert legacy rect to square
    const left = initialFractions?.left ?? 0.1;
    const top = initialFractions?.top ?? 0.1;
    const right = initialFractions?.right ?? 0.9;
    const bottom = initialFractions?.bottom ?? 0.9;
    const side = Math.min(right - left, bottom - top);
    return { x: left, y: top, size: side };
  });
  const [drag, setDrag] = useState(null); // { mode, ox, oy, obox }

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

    // equal 5x5 grid (green)
    ctx.strokeStyle = "#00ffa6";
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      ctx.beginPath(); ctx.moveTo(x + side * t, y); ctx.lineTo(x + side * t, y + side); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + side * t); ctx.lineTo(x + side, y + side * t); ctx.stroke();
    }

    // handles (corners + edges)
    ctx.fillStyle = "#00ffa6";
    const hs = 6;
    const pts = [
      ["nw", x, y], ["n", x + side / 2, y], ["ne", x + side, y],
      ["w", x, y + side / 2],              ["e", x + side, y + side / 2],
      ["sw", x, y + side], ["s", x + side / 2, y + side], ["se", x + side, y + side],
    ];
    for (const [, hx, hy] of pts) ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    ctx.restore();
  }

  function hitTest(mx, my, W, H) {
    const x = box.x * W, y = box.y * H, side = box.size * Math.min(W, H), tol = 10;
    const corners = { nw:[x,y], ne:[x+side,y], sw:[x,y+side], se:[x+side,y+side] };
    for (const [k,[hx,hy]] of Object.entries(corners))
      if (Math.abs(mx-hx)<=tol && Math.abs(my-hy)<=tol) return k;
    const edges = { n:[x+side/2,y], s:[x+side/2,y+side], w:[x,y+side/2], e:[x+side,y+side/2] };
    for (const [k,[hx,hy]] of Object.entries(edges))
      if (Math.abs(mx-hx)<=tol && Math.abs(my-hy)<=tol) return k;
    if (mx>=x && mx<=x+side && my>=y && my<=y+side) return "move";
    return null;
  }

  function onPointerDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const mode = hitTest(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (!mode) return;
    setDrag({ mode, ox: e.clientX - r.left, oy: e.clientY - r.top, obox: { ...box } });
  }

  function onPointerMove(e) {
    if (!drag) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const dx = mx - drag.ox, dy = my - drag.oy;
    const minSidePx = 40, minSide = minSidePx / Math.min(r.width, r.height);

    setBox(() => {
      let { x, y, size } = drag.obox;
      const W = r.width, H = r.height, base = Math.min(W, H);
      if (drag.mode === "move") {
        const nx = (x * W + dx) / W, ny = (y * H + dy) / H;
        x = Math.max(0, Math.min(1 - size, nx));
        y = Math.max(0, Math.min(1 - size, ny));
        return { x, y, size };
      }

      // resize with preserved 1:1 aspect: use the larger delta as the scalar
      const d = Math.max(Math.abs(dx), Math.abs(dy)) * (drag.mode.includes("n") || drag.mode.includes("w") ? -1 : 1);
      let newSize = Math.max(minSide, size + d / base);
      // anchor depends on handle, adjust x/y when size shrinks/expands toward anchor
      if (drag.mode === "nw") { x = drag.obox.x + (drag.obox.size - newSize); y = drag.obox.y + (drag.obox.size - newSize); }
      if (drag.mode === "ne") { y = drag.obox.y + (drag.obox.size - newSize); }
      if (drag.mode === "sw") { x = drag.obox.x + (drag.obox.size - newSize); }
      if (drag.mode === "se") { /* anchored at top-left, nothing to shift */ }
      if (drag.mode === "n")  { y = drag.obox.y + (drag.obox.size - newSize); }
      if (drag.mode === "w")  { x = drag.obox.x + (drag.obox.size - newSize); }
      // edges 's' and 'e' expand outward from top-left

      // clamp into image bounds
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + newSize > 1) x = 1 - newSize;
      if (y + newSize > 1) y = 1 - newSize;

      return { x, y, size: newSize };
    });
  }

  function onPointerUp() { setDrag(null); }

  function equalArray(n) { return Array.from({ length: n + 1 }, (_, i) => i / n); }
  function confirm() {
    const fractions = {
      top: box.y, left: box.x, right: box.x + box.size, bottom: box.y + box.size,
      cols: equalArray(5), rows: equalArray(5), x: box.x, y: box.y, size: box.size
    };
    onConfirm?.(fractions); // BingoCard will crop & send to matcher
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
          <small>Drag anywhere to move. Drag corners/edges to resize. Grid stays 1:1 square, 5×5 equal.</small>
        </div>
      </div>
    </div>
  );
}
