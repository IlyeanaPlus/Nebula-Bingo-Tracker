// src/utils/image.js
import { computeAhash64, computeDhash64, computePHash64, computeEdgeHash64 } from './phash';

export const PAD_FRAC = 0.08;          // trim outer edges of screenshot a bit more
const CELL_INNER_PAD = 0.12;           // trim inside each cell to avoid grid lines
const TARGET_BG = { r: 139, g: 139, b: 139 }; // #8b8b8b board gray

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

// --- Background normalization helpers ---
function estimateBorderMedian(data, w, h) {
  const valsR = [], valsG = [], valsB = [];
  function pushPixel(x, y) {
    const i = (y * w + x) * 4;
    valsR.push(data[i]); valsG.push(data[i+1]); valsB.push(data[i+2]);
  }
  for (let x=0; x<w; x++) { pushPixel(x,0); pushPixel(x,h-1); }
  for (let y=1; y<h-1; y++) { pushPixel(0,y); pushPixel(w-1,y); }
  const med = arr => { const s = arr.sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2); };
  return { r: med(valsR), g: med(valsG), b: med(valsB) };
}

function normalizeToTargetBG(canvas, targetBG = TARGET_BG) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0,0,w,h);
  const { data } = img;
  const bg = estimateBorderMedian(data, w, h);
  const dr = targetBG.r - bg.r;
  const dg = targetBG.g - bg.g;
  const db = targetBG.b - bg.b;
  for (let i=0; i<data.length; i+=4) {
    data[i]   = Math.max(0, Math.min(255, data[i]   + dr));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + dg));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + db));
  }
  ctx.putImageData(img,0,0);
  return canvas;
}

async function dataURLToCanvas(dataURL, w, h) {
  const img = await loadImage(dataURL);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

// Hash helpers (with normalization to TARGET_BG)
export async function calcGrayHashes(dataURL) {
  const canvas8 = await dataURLToCanvas(dataURL, 8, 8);
  normalizeToTargetBG(canvas8);
  const a = computeAhash64(canvas8, true, null);

  const canvasX = await dataURLToCanvas(dataURL, 9, 8);
  normalizeToTargetBG(canvasX);
  const dx = computeDhash64(canvasX, 'x', true, { w: 9, h: 8 }, null);

  const canvasY = await dataURLToCanvas(dataURL, 8, 9);
  normalizeToTargetBG(canvasY);
  const dy = computeDhash64(canvasY, 'y', true, { w: 8, h: 9 }, null);

  return { a, dx, dy };
}

export async function calcRGBHashes(dataURL) {
  const channels = {};
  for (const ch of ['R', 'G', 'B']) {
    const c8 = await dataURLToCanvas(dataURL, 8, 8);
    normalizeToTargetBG(c8);
    const a = computeAhash64(c8, false, ch);

    const cX = await dataURLToCanvas(dataURL, 9, 8);
    normalizeToTargetBG(cX);
    const dx = computeDhash64(cX, 'x', false, { w: 9, h: 8 }, ch);

    const cY = await dataURLToCanvas(dataURL, 8, 9);
    normalizeToTargetBG(cY);
    const dy = computeDhash64(cY, 'y', false, { w: 8, h: 9 }, ch);

    channels[ch] = { a, dx, dy };
  }
  return { R: channels.R, G: channels.G, B: channels.B };
}

export async function calcPHash(dataURL) {
  const c = await dataURLToCanvas(dataURL, 32, 32);
  normalizeToTargetBG(c);
  return computePHash64(c);
}

export async function calcEdgeHash(dataURL) {
  const c = await dataURLToCanvas(dataURL, 32, 32);
  normalizeToTargetBG(c);
  return computeEdgeHash64(c);
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
