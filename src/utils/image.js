// src/utils/image.js
// Grid-detecting cropper for 5x5 bingo board screenshots.

const OUT_SIZE = 32;
const ANALYZE_MAX = 640; // max dimension during analysis
const BRIGHT_T = 220;    // luma thresholds for line detection
const DARK_T   = 35;
const SMOOTH_W = 7;      // smoothing window (odd)
const MIN_GAP_FRAC = 1/6; // min peak spacing as fraction of width/height
const INSET_FRAC = 0.06;  // how much we inset inside each cell to avoid gridlines

// ---------------- File -> Image ----------------
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// ---------------- Helpers ----------------
function toCanvasFromImage(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
function getImageDataFromCanvas(cnv) {
  return cnv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cnv.width, cnv.height);
}
function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function smooth1D(arr, win = SMOOTH_W) {
  const n = arr.length, out = new Float32Array(n);
  const half = (win | 0) >> 1;
  let sum = 0;
  for (let i = 0; i < n + half; i++) {
    const add = i < n ? arr[i] : 0;
    const sub = i - win >= 0 ? arr[i - win] : 0;
    sum += add - sub;
    if (i >= half) {
      const idx = i - half;
      if (idx < n) out[idx] = sum / Math.min(win, idx + half + 1, n - (idx - half));
    }
  }
  return out;
}

function topNPeaks(arr, N, minDist) {
  // Greedy non-max suppression on descending scores
  const idxs = Array.from({ length: arr.length }, (_, i) => i).sort((a, b) => arr[b] - arr[a]);
  const chosen = [];
  for (const i of idxs) {
    if (arr[i] <= 0) break;
    if (chosen.every(j => Math.abs(j - i) >= minDist)) {
      chosen.push(i);
      if (chosen.length === N) break;
    }
  }
  return chosen.sort((a, b) => a - b);
}

function spacingVariance(lines) {
  if (lines.length < 2) return Infinity;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
  const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const v = gaps.reduce((a, b) => a + (b - m) * (b - m), 0) / gaps.length;
  return v;
}

function boundariesFromCenters(centers, max) {
  // Build 6 boundaries from 6 line centers using mirrored midpoints.
  const B = new Array(6);
  // Left outer boundary
  B[0] = Math.round(centers[0] - (centers[1] - centers[0]) / 2);
  for (let i = 1; i < 5; i++) {
    B[i] = Math.round((centers[i - 1] + centers[i]) / 2);
  }
  // Right outer boundary
  B[5] = Math.round(centers[5] + (centers[5] - centers[4]) / 2);
  // Clamp
  for (let i = 0; i < 6; i++) B[i] = Math.max(0, Math.min(max - 1, B[i]));
  // Ensure strictly increasing
  for (let i = 1; i < 6; i++) if (B[i] <= B[i - 1]) B[i] = B[i - 1] + 1;
  return B;
}

function cropToDataURL(srcCanvas, sx, sy, sw, sh, outSize = OUT_SIZE) {
  const out = document.createElement('canvas');
  out.width = outSize; out.height = outSize;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outSize, outSize);
  return out.toDataURL('image/png');
}

// ---------------- Line detection ----------------
function detectGridLinesFromImageData(im) {
  const { width: w, height: h, data } = im;

  // Column scores: fraction of very bright OR very dark pixels (line running through)
  const colScore = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let bright = 0, dark = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const L = luma(data[i], data[i + 1], data[i + 2]);
      if (L >= BRIGHT_T) bright++;
      else if (L <= DARK_T) dark++;
    }
    colScore[x] = Math.max(bright, dark) / h;
  }
  const colSmooth = smooth1D(colScore, SMOOTH_W);

  // Row scores
  const rowScore = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let bright = 0, dark = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const L = luma(data[i], data[i + 1], data[i + 2]);
      if (L >= BRIGHT_T) bright++;
      else if (L <= DARK_T) dark++;
    }
    rowScore[y] = Math.max(bright, dark) / w;
  }
  const rowSmooth = smooth1D(rowScore, SMOOTH_W);

  // Pick 6 peaks per axis with min distance ~ width/6
  const minDx = Math.max(4, Math.floor(w * MIN_GAP_FRAC * 0.7));
  const minDy = Math.max(4, Math.floor(h * MIN_GAP_FRAC * 0.7));
  let xCenters = topNPeaks(colSmooth, 6, minDx);
  let yCenters = topNPeaks(rowSmooth, 6, minDy);

  // Fallback: if not enough peaks, try less strict smoothing or equal spacing
  if (xCenters.length !== 6) xCenters = topNPeaks(colScore, 6, minDx);
  if (yCenters.length !== 6) yCenters = topNPeaks(rowScore, 6, minDy);

  // If still not 6, assume equal spacing across the tightest region where scores are non-zero
  function fallbackCenters(len, score) {
    const nz = [];
    for (let i = 0; i < len; i++) if (score[i] > 0) nz.push(i);
    if (nz.length < 10) {
      // whole image
      const step = len / 5;
      return [0, 1, 2, 3, 4, 5].map(k => Math.round(k * step));
    }
    const left = Math.max(0, nz[0] - 2), right = Math.min(len - 1, nz[nz.length - 1] + 2);
    const step = (right - left) / 5;
    return [0, 1, 2, 3, 4, 5].map(k => Math.round(left + k * step));
  }
  if (xCenters.length !== 6) xCenters = fallbackCenters(w, colSmooth);
  if (yCenters.length !== 6) yCenters = fallbackCenters(h, rowSmooth);

  // Prefer the solution whose spacings are most uniform
  // (we already built one; this is mainly defensive)
  // Build boundaries from centers
  const xBounds = boundariesFromCenters(xCenters, w);
  const yBounds = boundariesFromCenters(yCenters, h);

  return { xCenters, yCenters, xBounds, yBounds };
}

// ---------------- Public: crop25 ----------------
export async function crop25(img) {
  // 1) Analysis scale
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W * scale));
  const aH = Math.max(1, Math.round(H * scale));

  // 2) Draw analysis canvas
  const analyzeCanvas = toCanvasFromImage(img, aW, aH);
  const analyzeData = getImageDataFromCanvas(analyzeCanvas);

  // 3) Detect grid lines and boundaries on the analysis image
  const { xBounds, yBounds } = detectGridLinesFromImageData(analyzeData);

  // 4) Map boundaries back to original coordinates
  const inv = scale ? (1 / scale) : 1;
  const X = xBounds.map(v => Math.round(v * inv));
  const Y = yBounds.map(v => Math.round(v * inv));

  // 5) Build 25 crops, insetting within each cell
  const fullCanvas = toCanvasFromImage(img, W, H);
  const urls = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x0 = X[c],   x1 = X[c + 1];
      const y0 = Y[r],   y1 = Y[r + 1];
      let w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
      const inset = Math.max(1, Math.floor(Math.min(w, h) * INSET_FRAC));
      const sx = Math.max(0, x0 + inset);
      const sy = Math.max(0, y0 + inset);
      const sw = Math.max(1, x1 - inset - sx);
      const sh = Math.max(1, y1 - inset - sy);
      urls.push(cropToDataURL(fullCanvas, sx, sy, sw, sh, OUT_SIZE));
    }
  }
  return urls;
}
