// src/utils/image.js
// Crop utilities for 5x5 bingo grids + helpers.

/** Load grid fractions from localStorage (saved by tuner UI) */
export function loadFractions() {
  try {
    const raw = localStorage.getItem('nbt.gridFractions');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Save fractions */
export function saveFractions(frac) {
  try {
    localStorage.setItem('nbt.gridFractions', JSON.stringify(frac));
  } catch {}
}

/**
 * Compute 25 crops (as dataURLs) using saved grid fractions (equalized 5x5).
 * Expects an <img> element already loaded.
 */
export function computeCrops25(img, fractions = loadFractions()) {
  const W = img.naturalWidth ?? img.width;
  const H = img.naturalHeight ?? img.height;
  if (!W || !H) throw new Error("computeCrops25: image lacks dimensions");

  // Default to equal 5x5 if no fractions present
  let cols = fractions?.cols ?? Array(5).fill(1/5);
  let rows = fractions?.rows ?? Array(5).fill(1/5);

  // Convert fractions → pixel ranges
  const xEdges = [0];
  const yEdges = [0];
  for (let i = 0; i < 5; i++) xEdges.push(xEdges[i] + Math.round(cols[i] * W));
  for (let j = 0; j < 5; j++) yEdges.push(yEdges[j] + Math.round(rows[j] * H));
  xEdges[5] = W; yEdges[5] = H;

  const crops = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = xEdges[c];
      const y = yEdges[r];
      const w = xEdges[c+1] - x;
      const h = yEdges[r+1] - y;

      // Inset slightly to avoid grid lines
      const inset = Math.floor(Math.min(w, h) * 0.06);
      const sx = x + inset, sy = y + inset;
      const sw = Math.max(1, w - inset*2), sh = Math.max(1, h - inset*2);

      const can = document.createElement('canvas');
      can.width = sw; can.height = sh;
      const ctx = can.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      crops.push(can.toDataURL('image/png'));
    }
  }
  return crops;
}

/** Utility to convert a File to an <img> element */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}