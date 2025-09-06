// src/utils/image.js

/** Load an image from a URL with CORS enabled so canvas reads are allowed. */
export function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';  // IMPORTANT: set before src
    img.decoding = 'async';
    img.onload = async () => {
      try { if (img.decode) await img.decode(); } catch {}
      resolve(img);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/** Load an image from a File (e.g., input[type=file]). Uses object URLs. */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = async () => {
      try { if (img.decode) await img.decode(); } catch {}
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Crop a source (Image/Canvas/Video) to a new canvas rect. */
export function cropToCanvas(source, x, y, w, h) {
  const out = document.createElement('canvas');
  out.width = Math.max(1, w | 0);
  out.height = Math.max(1, h | 0);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}

/** Resize any drawable to a new canvas (used by hashing). */
function resizeToCanvas(source, w, h) {
  const cvs = document.createElement('canvas');
  cvs.width = Math.max(1, w | 0);
  cvs.height = Math.max(1, h | 0);
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, cvs.width, cvs.height);
  return cvs;
}

/** Convert RGB to luma (Rec.601). */
function rgbaToLuma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Get grayscale pixels (Float32) of size n×m from a drawable. */
function grayscaleFromDrawable(source, w, h) {
  const small = resizeToCanvas(source, w, h);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    g[j] = rgbaToLuma(data[i], data[i + 1], data[i + 2]);
  }
  return g;
}

/** aHash (average hash), returns array of 0/1 bits of size n*n (default 8*8=64). */
export function ahashFromImage(source, n = 8) {
  const size = Math.max(2, n | 0);
  const g = grayscaleFromDrawable(source, size, size);
  let sum = 0; for (let i = 0; i < g.length; i++) sum += g[i];
  const avg = sum / g.length;
  const bits = new Array(g.length);
  for (let i = 0; i < g.length; i++) bits[i] = g[i] >= avg ? 1 : 0;
  return bits;
}

/**
 * dHash (difference hash).
 * - axis 'x': compare (n+1)x n horizontally-adjacent pixels
 * - axis 'y': compare n x (n+1) vertically-adjacent pixels
 * Returns array of 0/1 bits length n*n.
 */
export function dhashFromImage(source, n = 8, axis = 'x') {
  const N = Math.max(2, n | 0);
  if (axis === 'y') {
    const g = grayscaleFromDrawable(source, N, N + 1);
    const bits = new Array(N * N);
    let k = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, k++) {
        const a = g[y * (N + 1) + x];
        const b = g[(y + 1) * (N + 1) + x];
        bits[k] = a > b ? 1 : 0;
      }
    }
    return bits;
  } else {
    const g = grayscaleFromDrawable(source, N + 1, N);
    const bits = new Array(N * N);
    let k = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, k++) {
        const a = g[y * (N + 1) + x];
        const b = g[y * (N + 1) + x + 1];
        bits[k] = a > b ? 1 : 0;
      }
    }
    return bits;
  }
}

/** Hamming distance between two bit arrays (0/1). */
export function hammingDistanceBits(a, b) {
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) if ((a[i] | 0) !== (b[i] | 0)) d++;
  return d + Math.abs((a.length | 0) - (b.length | 0));
}

/** Even grid boxes (not used directly, kept for convenience). */
export function evenGridBoxes(width, height, rows, cols) {
  const boxes = [];
  const cw = width / cols;
  const ch = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({
        x: Math.floor(c * cw),
        y: Math.floor(r * ch),
        w: Math.floor(cw),
        h: Math.floor(ch),
      });
    }
  }
  return boxes;
}
