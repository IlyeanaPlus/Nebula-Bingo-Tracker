import { getBlob } from './net';

export async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url, originUrl: null };
}
export async function loadImageFromURL(originUrl) {
  const blob = await getBlob(originUrl, "downloading image from Drive");
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url, originUrl };
}

export function ahashFromImage(img, size = 16) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  c.width = size; c.height = size;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let gray = new Array(size * size), sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[p] = v; sum += v;
  }
  const avg = sum / gray.length;
  return gray.map((v) => (v >= avg ? 1 : 0));
}
export function hammingDistanceBits(aBits, bBits) {
  const n = Math.min(aBits.length, bBits.length);
  let d = 0; for (let i = 0; i < n; i++) if (aBits[i] !== bBits[i]) d++;
  return d + Math.max(aBits.length, bBits.length) - n;
}
export function cropToCanvas(srcImg, box) {
  const { x, y, w, h } = box;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(srcImg, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}
export function evenGridBoxes(imgW, imgH, rows, cols, inset = 0, startX = 0, startY = 0, cellW, cellH, gapX = 0, gapY = 0) {
  const w = cellW ?? Math.floor((imgW - startX - (cols - 1) * gapX) / cols);
  const h = cellH ?? Math.floor((imgH - startY - (rows - 1) * gapY) / rows);
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (w + gapX) + inset;
      const y = startY + r * (h + gapY) + inset;
      const bw = Math.max(1, w - 2 * inset);
      const bh = Math.max(1, h - 2 * inset);
      boxes.push({ r, c, x, y, w: bw, h: bh });
    }
  }
  return boxes;
}
