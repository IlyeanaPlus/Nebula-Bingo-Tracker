// src/utils/image.js
import { computeAhash64, computeDhash64 } from './hashing';

export const PAD_FRAC = 0.08;          // trim outer edges of screenshot a bit more
const CELL_INNER_PAD = 0.12;           // trim inside each cell to avoid grid lines

export async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  return img;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Crop the screenshot into 25 cell images, avoiding grid lines/background bleed
export function crop25(img, padFrac = PAD_FRAC) {
  const { width, height } = img;
  const padX = Math.floor(width * padFrac);
  const padY = Math.floor(height * padFrac);
  const w = width - padX * 2;
  const h = height - padY * 2;
  const cellW = Math.floor(w / 5);
  const cellH = Math.floor(h / 5);

  const innerX = Math.floor(cellW * CELL_INNER_PAD);
  const innerY = Math.floor(cellH * CELL_INNER_PAD);
  const innerW = cellW - innerX * 2;
  const innerH = cellH - innerY * 2;

  const crops = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = innerW;
  canvas.height = innerH;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sx = padX + c * cellW + innerX;
      const sy = padY + r * cellH + innerY;
      ctx.clearRect(0, 0, innerW, innerH);
      ctx.drawImage(img, sx, sy, innerW, innerH, 0, 0, innerW, innerH);
      crops.push(canvas.toDataURL('image/png'));
    }
  }
  return crops;
}

// Hash helpers
export async function calcGrayHashes(dataURL) {
  const a = await computeAhash64(dataURL, true, null);
  const dx = await computeDhash64(dataURL, 'x', true, { w: 9, h: 8 }, null);
  const dy = await computeDhash64(dataURL, 'y', true, { w: 8, h: 9 }, null);
  return { a, dx, dy };
}

export async function calcRGBHashes(dataURL) {
  const channels = {};
  for (const ch of ['R', 'G', 'B']) {
    const a = await computeAhash64(dataURL, false, ch);
    const dx = await computeDhash64(dataURL, 'x', false, { w: 9, h: 8 }, ch);
    const dy = await computeDhash64(dataURL, 'y', false, { w: 8, h: 9 }, ch);
    channels[ch] = { a, dx, dy };
  }
  return { R: channels.R, G: channels.G, B: channels.B };
}

// 64-bit hex Hamming distance (0..64)
export function hamming64(hex1, hex2) {
  if (!hex1 || !hex2) return 64;
  const a = BigInt('0x' + hex1);
  const b = BigInt('0x' + hex2);
  let x = a ^ b;
  let count = 0;
  while (x) {
    x &= (x - 1n);
    count++;
  }
  return count;
}
