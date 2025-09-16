// src/utils/computeCrops25Squares.js
// Given the source canvas + normalized square selection, return 25 square canvases.

export function computeCrops25Squares(srcCanvas, fractions, opts = {}) {
  if (!srcCanvas || !fractions) return Array(25).fill(null);

  const w = srcCanvas.width, h = srcCanvas.height;
  const g = srcCanvas.getContext("2d", { willReadFrequently: true });

  const Smin = Math.min(w, h);
  const S = Math.max(10, (fractions.size || 0.8) * Smin);
  const X = clamp((fractions.x || 0) * w, 0, w - S);
  const Y = clamp((fractions.y || 0) * h, 0, h - S);

  const innerInsetPct = Math.max(0, Math.min(0.1, Number(opts.innerInsetPct ?? 0)));
  const cell = S / 5;
  const inset = innerInsetPct * cell;

  const out = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sx = X + c * cell + inset;
      const sy = Y + r * cell + inset;
      const sSize = cell - 2 * inset;

      const o = document.createElement("canvas");
      o.width = sSize; o.height = sSize;
      const og = o.getContext("2d", { willReadFrequently: true });
      og.imageSmoothingEnabled = false;
      og.drawImage(srcCanvas, sx, sy, sSize, sSize, 0, 0, sSize, sSize);
      out.push(o);
    }
  }
  return out;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export default computeCrops25Squares;
