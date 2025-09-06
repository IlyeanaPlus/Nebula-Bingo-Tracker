// src/utils/image.js

/**
 * Load an image from a File or Blob.
 */
export async function loadImageFromFile(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError('loadImageFromFile expects a File or Blob.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromURL(url);
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from a URL.
 */
export function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed for canvas + hashing
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/**
 * Average hash (aHash) from an image.
 * Produces a binary string representing luminance grid.
 */
export function ahashFromImage(img, size = 8) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size).data;
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray.push((r + g + b) / 3);
  }
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  return gray.map((v) => (v > avg ? 1 : 0));
}

/**
 * Crop an image to a canvas (returns canvas element).
 */
export function cropToCanvas(img, x, y, w, h) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/**
 * Divide an area into an even grid of boxes.
 */
export function evenGridBoxes(width, height, rows, cols) {
  const boxes = [];
  const boxW = width / cols;
  const boxH = height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({
        x: c * boxW,
        y: r * boxH,
        w: boxW,
        h: boxH,
      });
    }
  }
  return boxes;
}

/**
 * Hamming distance between two bit arrays.
 */
export function hammingDistanceBits(a, b) {
  if (a.length !== b.length) {
    throw new Error('Bit arrays must be same length');
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}
