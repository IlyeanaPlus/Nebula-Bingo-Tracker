// src/utils/computeCrops25Squares.js
// Compute 25 square crops from a 5×5 grid region; each tile is the centered inscribed square.

export function computeCrops25Squares(imageElOrCanvas, fractions, opts = {}) {
  const rows = opts.rows || 5, cols = opts.cols || 5;
  const lineInsetPx = Number.isFinite(opts.lineInsetPx) ? opts.lineInsetPx : 2;     // push away from grid lines
  const innerInsetPct = Number.isFinite(opts.innerInsetPct) ? opts.innerInsetPct : 0.00; // additional shrink inside cell (0..0.2)

  // normalize to canvas
  const cFull = (() => {
    if (imageElOrCanvas && typeof imageElOrCanvas.getContext === "function") return imageElOrCanvas;
    const w = imageElOrCanvas.naturalWidth || imageElOrCanvas.width;
    const h = imageElOrCanvas.naturalHeight || imageElOrCanvas.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(imageElOrCanvas, 0, 0);
    return c;
  })();

  const W = cFull.width|0, H = cFull.height|0;
  const left   = Math.round((fractions.left   || 0) * W);
  const top    = Math.round((fractions.top    || 0) * H);
  const width  = Math.round((fractions.width  || 1) * W);
  const height = Math.round((fractions.height || 1) * H);

  // base cell size
  const cellW = width / cols;
  const cellH = height / rows;

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = left + c * cellW;
      const y0 = top  + r * cellH;

      // inscribed square side, keep away from grid lines
      const baseSide = Math.min(cellW, cellH) - 2 * lineInsetPx;
      const side = Math.max(4, Math.floor(baseSide * (1 - innerInsetPct)));

      // center the square in the cell
      const cx = Math.round(x0 + (cellW - side) / 2);
      const cy = Math.round(y0 + (cellH - side) / 2);

      const out = document.createElement("canvas");
      out.width = side; out.height = side;
      out.getContext("2d").drawImage(
        cFull,
        Math.max(0, cx), Math.max(0, cy), side, side,
        0, 0, side, side
      );
      tiles.push(out);
    }
  }
  return tiles;
}
