// src/utils/image.js

/** Load an image from a URL with CORS enabled so canvas reads are allowed. */
export function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // IMPORTANT: set before src so the request includes CORS mode=anonymous
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    // Optional (some CDNs are picky, safe default):
    // img.referrerPolicy = 'no-referrer';

    img.onload = async () => {
      // If supported, ensure decode finished (avoids layout jank)
      try {
        if (img.decode) await img.decode();
      } catch {
        /* ignore decode errors; onload already fired */
      }
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
    // object URLs are same-origin; CORS not required but harmless:
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {}
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

/** Resize any drawable to a new canvas (used by aHash). */
function resizeToCanvas(source, w, h) {
  const cvs = document.createElement('canvas');
  cvs.width = Math.max(1, w | 0);
  cvs.height = Math.max(1, h | 0);
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, cvs.width, cvs.height);
  return cvs;
}

/** Convert RGBA buffer to luma (grayscale) using Rec.601. */
function rgbaToLuma(r, g, b /*, a */) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * aHash (average hash).
 * - Downscale to N×N (default 8×8 = 64 bits)
 * - Convert to grayscale
 * - Threshold by the mean gray
 * Returns: Array of 0/1 bits length N*N
 */
export function ahashFromImage(source, n = 8) {
  const size = Math.max(2, n | 0);
  const small = resizeToCanvas(source, size, size);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, size, size);

  const grays = new Float32Array(size * size);
  let sum = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = rgbaToLuma(data[i], data[i + 1], data[i + 2]);
    grays[j] = g;
    sum += g;
  }
  const avg = sum / grays.length;

  const bits = new Array(grays.length);
  for (let i = 0; i < grays.length; i++) bits[i] = grays[i] >= avg ? 1 : 0;
  return bits;
}

/** Hamming distance between two bit arrays (0/1). */
export function hammingDistanceBits(a, b) {
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) if ((a[i] | 0) !== (b[i] | 0)) d++;
  // If lengths differ, count the rest as different
  return d + Math.abs((a.length | 0) - (b.length | 0));
}

/** Utility: compute evenly spaced grid boxes (not used by current App, but handy). */
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
