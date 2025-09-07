// src/utils/image.js
/**
 * Minimal image helpers for Nebula Bingo Tracker — gridbox-first.
 * Auto-cropping is intentionally removed. We rely on user-tuned grid fractions.
 */

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/**
 * computeCrops25(img, fractions)
 * - fractions: { top,left,right,bottom, cols:[0..1]*6, rows:[0..1]*6 }
 * Returns 25 dataURLs (native-scale square crops).
 * We compute each cell box within the frame, then crop a centered square.
 */
export function computeCrops25(img, fractions) {
  const { top, left, right, bottom, cols, rows } = fractions;
  const L = left * img.width;
  const R = right * img.width;
  const T = top * img.height;
  const B = bottom * img.height;

  const crops = [];
  const W = R - L;
  const H = B - T;

  // helper: crop region to dataURL
  const toURL = (x, y, w, h) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  };

  for (let r = 0; r < 5; r++) {
    const y0 = T + H * rows[r];
    const y1 = T + H * rows[r + 1];
    for (let c = 0; c < 5; c++) {
      const x0 = L + W * cols[c];
      const x1 = L + W * cols[c + 1];
      const cellW = x1 - x0;
      const cellH = y1 - y0;
      const side = Math.min(cellW, cellH);
      const cx = x0 + (cellW - side) / 2;
      const cy = y0 + (cellH - side) / 2;
      crops.push(toURL(cx, cy, side, side));
    }
  }
  return crops;
}

/** loadFractions() / saveFractions() */
export function loadFractions() {
  try {
    const saved = JSON.parse(localStorage.getItem("nbt.gridFractions") || "null");
    if (saved) return saved;
  } catch {}
  // default equal grid
  const eq = (n) => Array.from({ length: n+1 }, (_, i) => i / n);
  return { top: 0, left: 0, right: 1, bottom: 1, cols: eq(5), rows: eq(5) };
}

export function saveFractions(f) {
  localStorage.setItem("nbt.gridFractions", JSON.stringify(f));
}
