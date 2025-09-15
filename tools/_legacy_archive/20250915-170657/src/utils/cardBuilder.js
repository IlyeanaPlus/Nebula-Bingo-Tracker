// src/utils/cardBuilder.js
import { loadImageFromURL } from './image.js';

/**
 * Build a bingo card canvas from tile image URLs.
 * @param {Object} opts
 * @param {string[]} opts.tiles - array of image URLs (length = rows*cols)
 * @param {number} opts.cols
 * @param {number} opts.rows
 * @param {number} [opts.cellSize=128]
 * @param {number} [opts.gutter=8]
 * @param {string} [opts.background='#111']
 * @param {number} [opts.padding=12]
 * @returns {Promise<{canvas: HTMLCanvasElement, dataURL: string}>}
 */
export async function buildCard({
  tiles,
  cols,
  rows,
  cellSize = 128,
  gutter = 8,
  background = '#111',
  padding = 12,
}) {
  if (!Array.isArray(tiles) || tiles.length !== cols * rows) {
    throw new Error(`tiles length (${tiles?.length}) must be rows*cols (${rows * cols})`);
  }

  const width  = cols * cellSize + (cols - 1) * gutter + padding * 2;
  const height = rows * cellSize + (rows - 1) * gutter + padding * 2;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(width);
  canvas.height = Math.floor(height);

  // Background
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  const images = await Promise.all(tiles.map((url) => loadImageFromURL(url)));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = padding + c * (cellSize + gutter);
      const y = padding + r * (cellSize + gutter);
      const img = images[idx];

      // Contain-fit into cell while preserving aspect
      const scale = Math.min(cellSize / img.width, cellSize / img.height);
      const drawW = Math.round(img.width * scale);
      const drawH = Math.round(img.height * scale);
      const dx = x + Math.floor((cellSize - drawW) / 2);
      const dy = y + Math.floor((cellSize - drawH) / 2);

      // Cell background (subtle)
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(x, y, cellSize, cellSize);

      ctx.drawImage(img, dx, dy, drawW, drawH);
    }
  }

  const dataURL = canvas.toDataURL('image/png');
  return { canvas, dataURL };
}
