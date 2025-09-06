import { computeAhash64, computeDhash64 } from './hashing';
// NOTE: Keep your existing implementations of computeAhash64 / computeDhash64.
// This module adds wrappers and grid cropping helpers used by the new BingoCard.

export const PAD_FRAC = 0.04; // tunable
export const HASH_CFG = {
  ahashSize: 8,
  dhashX: { w: 9, h: 8 },
  dhashY: { w: 8, h: 9 }
};

export async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function crop25(img, padFrac = PAD_FRAC) {
  const { width, height } = img;
  const padX = Math.floor(width * padFrac);
  const padY = Math.floor(height * padFrac);
  const w = width - padX * 2;
  const h = height - padY * 2;
  const cellW = Math.floor(w / 5);
  const cellH = Math.floor(h / 5);

  const crops = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = cellW;
  canvas.height = cellH;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sx = padX + c * cellW;
      const sy = padY + r * cellH;
      ctx.clearRect(0,0,cellW,cellH);
      ctx.drawImage(img, sx, sy, cellW, cellH, 0, 0, cellW, cellH);
      crops.push(canvas.toDataURL('image/png'));
    }
  }
  return crops;
}

// ---- Hashing wrappers ----
// These wrappers expect existing hash functions in your project:
//   computeAhash64(dataURL, grayscale = true, channel?)
//   computeDhash64(dataURL, mode: 'x'|'y', grayscale = true, cfg, channel?)
// Return 64-bit values as hex strings (without 0x) or BigInt-compatible hex.

export async function calcGrayHashes(dataURL) {
  const a = await computeAhash64(dataURL, /*grayscale*/ true);
  const dx = await computeDhash64(dataURL, 'x', true, HASH_CFG.dhashX);
  const dy = await computeDhash64(dataURL, 'y', true, HASH_CFG.dhashY);
  return { a, dx, dy };
}

export async function calcRGBHashes(dataURL) {
  const chans = ['R','G','B'];
  const out = {};
  for (const ch of chans) {
    const a = await computeAhash64(dataURL, /*grayscale*/ false, ch);
    const dx = await computeDhash64(dataURL, 'x', false, HASH_CFG.dhashX, ch);
    const dy = await computeDhash64(dataURL, 'y', false, HASH_CFG.dhashY, ch);
    out[ch] = { a, dx, dy };
  }
  return out;
}

// Hamming distance between two 64-bit numbers represented as BigInt or hex string
export function hamming64(a, b) {
  const ax = (typeof a === 'bigint') ? a : BigInt('0x' + a);
  const bx = (typeof b === 'bigint') ? b : BigInt('0x' + b);
  let x = ax ^ bx;
  let count = 0n;
  while (x) { x &= (x - 1n); count++; }
  return Number(count);
}
