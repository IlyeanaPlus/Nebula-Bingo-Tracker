// src/components/GridTunerModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * GridTunerModal
 * Presents an image with a 5x5 adjustable grid overlay.
 * Stores fractions to localStorage.nbt.gridFractions = { top, left, right, bottom, cols: [..], rows: [..] }
 * Returns confirmed fractions via onConfirm(fractions).
 */
export default function GridTunerModal({ imageSrc, initialFractions, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [fractions, setFractions] = useState(() => {
    // Defaults: equal 5x5, full frame
    const eq = (n) => Array.from({ length: n+1 }, (_, i) => i / n);
    const def = {
      top: 0.0,
      left: 0.0,
      right: 1.0,
      bottom: 1.0,
      cols: eq(5),
      rows: eq(5),
    };
    try {
      if (initialFractions) return { ...def, ...initialFractions };
      const saved = JSON.parse(localStorage.getItem("nbt.gridFractions") || "null");
      return saved ? { ...def, ...saved } : def;
    } catch {
      return def;
    }
  });
  const [img, setImg] = useState(null);
  const draggingRef = useRef(null); // { type: 'v'|'h'|'frame', index?, edge? }

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, fractions]);

  function saveLocal() {
    localStorage.setItem("nbt.gridFractions", JSON.stringify(fractions));
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    // Fit image into canvas while preserving aspect ratio
    const dpr = window.devicePixelRatio || 1;
    const maxW = 860; // modal width hardcap
    const scale = Math.min(1, maxW / img.width);
    const W = Math.round(img.width * scale);
    const H = Math.round(img.height * scale);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    // Frame rect
    const L = fractions.left * W;
    const R = fractions.right * W;
    const T = fractions.top * H;
    const B = fractions.bottom * H;

    ctx.save();
    // Shade outside frame
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, T);
    ctx.fillRect(0, B, W, H - B);
    ctx.fillRect(0, T, L, B - T);
    ctx.fillRect(R, T, W - R, B - T);

    // Draw frame
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00e0ff";
    ctx.strokeRect(L, T, R - L, B - T);

    // Grid lines
    ctx.strokeStyle = "#00ffa6";
    ctx.lineWidth = 1.5;
    // verticals
    fractions.cols.forEach((f, i) => {
      const x = L + (R - L) * f;
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x, B);
      ctx.stroke();
      if (i > 0 && i < fractions.cols.length - 1) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(x - 14, T - 20, 28, 16);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${i}`, x, T - 8);
      }
    });
    // horizontals
    fractions.rows.forEach((f, i) => {
      const y = T + (B - T) * f;
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(R, y);
      ctx.stroke();
      if (i > 0 && i < fractions.rows.length - 1) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(L - 28, y - 8, 24, 16);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${i}`, L - 6, y);
      }
    });

    ctx.restore();
  }

  function pickHandle(mx, my, W, H) {
    // Hit test: frame edges and grid lines
    const L = fractions.left * W;
    const R = fractions.right * W;
    const T = fractions.top * H;
    const B = fractions.bottom * H;
    const tol = 8;

    // Frame edges
    if (Math.abs(mx - L) <= tol && my >= T && my <= B) return { type: "frame", edge: "left" };
    if (Math.abs(mx - R) <= tol && my >= T && my <= B) return { type: "frame", edge: "right" };
    if (Math.abs(my - T) <= tol && mx >= L && mx <= R) return { type: "frame", edge: "top" };
    if (Math.abs(my - B) <= tol && mx >= L && mx <= R) return { type: "frame", edge: "bottom" };

    // Grid lines
    // verticals
    for (let i = 1; i < fractions.cols.length - 1; i++) {
      const x = L + (R - L) * fractions.cols[i];
      if (Math.abs(mx - x) <= tol && my >= T && my <= B) return { type: "v", index: i };
    }
    // horizontals
    for (let j = 1; j < fractions.rows.length - 1; j++) {
      const y = T + (B - T) * fractions.rows[j];
      if (Math.abs(my - y) <= tol && mx >= L && mx <= R) return { type: "h", index: j };
    }
    return null;
  }

  function onPointerDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const handle = pickHandle(mx, my, W, H);
    draggingRef.current = handle;
  }

  function onPointerMove(e) {
    const handle = draggingRef.current;
    if (!handle) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;

    setFractions((prev) => {
      const L = prev.left * W;
      const R = prev.right * W;
      const T = prev.top * H;
      const B = prev.bottom * H;
      const clamp01 = (v) => Math.min(1, Math.max(0, v));

      if (handle.type === "frame") {
        if (handle.edge === "left") {
          const newLeft = clamp01(mx / W);
          if (newLeft < prev.right - 0.05) return { ...prev, left: newLeft };
        } else if (handle.edge === "right") {
          const newRight = clamp01(mx / W);
          if (newRight > prev.left + 0.05) return { ...prev, right: newRight };
        } else if (handle.edge === "top") {
          const newTop = clamp01(my / H);
          if (newTop < prev.bottom - 0.05) return { ...prev, top: newTop };
        } else if (handle.edge === "bottom") {
          const newBottom = clamp01(my / H);
          if (newBottom > prev.top + 0.05) return { ...prev, bottom: newBottom };
        }
        return prev;
      } else if (handle.type === "v") {
        // Move vertical line i within (0,1), keep order
        const i = handle.index;
        const xRel = (mx - L) / (R - L);
        const v = clamp01(xRel);
        const cols = prev.cols.slice();
        const min = cols[i - 1] + 0.02;
        const max = cols[i + 1] - 0.02;
        cols[i] = Math.min(max, Math.max(min, v));
        return { ...prev, cols };
      } else if (handle.type === "h") {
        const j = handle.index;
        const yRel = (my - T) / (B - T);
        const v = clamp01(yRel);
        const rows = prev.rows.slice();
        const min = rows[j - 1] + 0.02;
        const max = rows[j + 1] - 0.02;
        rows[j] = Math.min(max, Math.max(min, v));
        return { ...prev, rows };
      }
      return prev;
    });
  }

  function onPointerUp() {
    draggingRef.current = null;
    saveLocal();
  }

  function resetEqual() {
    const eq = (n) => Array.from({ length: n+1 }, (_, i) => i / n);
    setFractions((f) => ({
      ...f,
      cols: eq(5),
      rows: eq(5),
    }));
    setTimeout(saveLocal, 0);
  }

  return (
    <div className="nbt-modal-backdrop">
      <div className="nbt-modal">
        <div className="nbt-modal-header">
          <h3>Grid Tuner</h3>
          <div className="spacer" />
          <button className="nbt-btn subtle" onClick={resetEqual}>Equalize</button>
          <button className="nbt-btn" onClick={() => onConfirm(fractions)}>Confirm</button>
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
          <small>Drag cyan frame edges to set the outer bounds. Drag green lines to adjust the 5×5 grid. Settings auto-save.</small>
        </div>
      </div>
    </div>
  );
}
