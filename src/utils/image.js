// src/utils/image.js
// Detect outer frame → subdivide equally → crop *square* cell interiors.
// NOTE: crops are returned at their native pixel size (no scaling).

const ANALYZE_MAX = 800; // analysis downscale cap (does not affect crop resolution)
const BRIGHT_T = 215;    // luma >= bright is considered part of a line
const DARK_T   = 45;     // luma <= dark is considered part of a line
const SMOOTH_W = 9;      // smoothing window for line strength
const LINE_INNER_OFFSET = 2;  // px stepped inside detected outer lines (full-res space)
const CELL_INSET_FRAC = 0.08; // inset % inside each cell to avoid gridlines

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// --- canvas helpers ---
function toCanvasFromImage(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
function getImageData(cnv) {
  return cnv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cnv.width, cnv.height);
}
function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// --- profiles & smoothing ---
function smooth1D(arr, win = SMOOTH_W) {
  const n = arr.length, out = new Float32Array(n);
  const w = Math.max(1, win | 0), half = (w - 1) >> 1;
  let sum = 0;
  for (let i = 0; i < n + half; i++) {
    const add = i < n ? arr[i] : 0;
    const sub = (i - w >= 0) ? arr[i - w] : 0;
    sum += add - sub;
    if (i >= half) {
      const idx = i - half;
      if (idx < n) out[idx] = sum / Math.min(w, idx + half + 1, n - (idx - half));
    }
  }
  return out;
}
function columnLineStrength(im) {
  const { data, width: w, height: h } = im;
  const s = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const L = luma(data[i], data[i + 1], data[i + 2]);
      if (L >= BRIGHT_T || L <= DARK_T) cnt++;
    }
    s[x] = cnt / h;
  }
  return smooth1D(s);
}
function rowLineStrength(im) {
  const { data, width: w, height: h } = im;
  const s = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let cnt = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const L = luma(data[i], data[i + 1], data[i + 2]);
      if (L >= BRIGHT_T || L <= DARK_T) cnt++;
    }
    s[y] = cnt / w;
  }
  return smooth1D(s);
}
function argmaxRange(arr, lo, hi) {
  lo = Math.max(0, lo | 0);
  hi = Math.min(arr.length, hi | 0);
  let bestI = lo, bestV = -Infinity;
  for (let i = lo; i < hi; i++) {
    const v = arr[i];
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return bestI;
}

// --- detect outer frame ---
function detectOuterFrame(im) {
  const w = im.width, h = im.height;
  const col = columnLineStrength(im);
  const row = rowLineStrength(im);

  const left  = argmaxRange(col, 0, Math.floor(w * 0.33));
  const right = argmaxRange(col, Math.floor(w * 0.67), w);
  const top   = argmaxRange(row, 0, Math.floor(h * 0.33));
  const bottom= argmaxRange(row, Math.floor(h * 0.67), h);

  const L = Math.max(0, Math.min(left, right - 10));
  const R = Math.min(w - 1, Math.max(right, L + 10));
  const T = Math.max(0, Math.min(top, bottom - 10));
  const B = Math.min(h - 1, Math.max(bottom, T + 10));
  return { L, R, T, B };
}

// create a dataURL without resampling (native crop size)
function cropToDataURLNative(srcCanvas, sx, sy, sw, sh) {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    srcCanvas,
    Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
    0, 0, out.width, out.height
  );
  return out.toDataURL('image/png');
}

// --- Public: crop25 ---
// Returns 25 PNG dataURLs at *native* cell-interior size (no scaling).
export async function crop25(img) {
  // analysis downscale (does not affect crop resolution)
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W * scale));
  const aH = Math.max(1, Math.round(H * scale));

  const analyzeCanvas = toCanvasFromImage(img, aW, aH);
  const analyzeData = getImageData(analyzeCanvas);
  const { L, R, T, B } = detectOuterFrame(analyzeData);

  // map outer frame back to full-res and step slightly inside the lines
  const inv = scale ? (1 / scale) : 1;
  const innerL = Math.max(0, Math.round(L * inv) + LINE_INNER_OFFSET);
  const innerR = Math.min(W, Math.round(R * inv) - LINE_INNER_OFFSET);
  const innerT = Math.max(0, Math.round(T * inv) + LINE_INNER_OFFSET);
  const innerB = Math.min(H, Math.round(B * inv) - LINE_INNER_OFFSET);

  const boardW = Math.max(1, innerR - innerL);
  const boardH = Math.max(1, innerB - innerT);
  const cellW = boardW / 5;
  const cellH = boardH / 5;

  // full-res canvas
  const full = toCanvasFromImage(img, W, H);

  const urls = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x0 = innerL + c * cellW;
      const y0 = innerT + r * cellH;

      // enforce *square* interior by using smaller side, centered
      const side = Math.min(cellW, cellH);
      let cx = x0 + (cellW - side) / 2;
      let cy = y0 + (cellH - side) / 2;

      // inset from grid lines
      const inset = side * CELL_INSET_FRAC;
      cx += inset; cy += inset;
      const sw = Math.max(1, side - inset * 2);
      const sh = sw; // square

      urls.push(cropToDataURLNative(full, cx, cy, sw, sh)); // native size
    }
  }
  return urls;
}
