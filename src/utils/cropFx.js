// src/utils/cropFx.js
// Helpers to (a) remove flat background to alpha, (b) tight-crop, (c) prepare
// a 224x224 canvas for CLIP while keeping a transparent preview.

function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

function createCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function sampleEdgeColor(canvas) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, 0, W, H).data;

  // sample N points around the border
  const samples = [];
  const N = 400;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    // alternate edges
    const x = i % 2 ? Math.floor(t * (W - 1)) : (i % 4 ? W - 1 : 0);
    const y = i % 2 ? (i % 4 ? 0 : H - 1) : Math.floor(t * (H - 1));
    const idx = (y * W + x) * 4;
    samples.push([id[idx], id[idx+1], id[idx+2]]);
  }
  // median per channel
  const med = [0,1,2].map(ch => {
    const arr = samples.map(s => s[ch]).sort((a,b)=>a-b);
    return arr[(arr.length/2)|0];
  });
  return { r: med[0], g: med[1], b: med[2] };
}

function toAlpha(canvas, bg, tol = 28){
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const t2 = tol * tol;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i]   - bg.r;
    const dg = d[i+1] - bg.g;
    const db = d[i+2] - bg.b;
    if ((dr*dr + dg*dg + db*db) <= t2) {
      d[i+3] = 0; // punch to transparent
    }
  }
  ctx.putImageData(img, 0, 0);
  return img; // return alpha’d data for bbox
}

function alphaBBox(img, W, H, minA = 8){
  const d = img.data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y*W + x)*4 + 3];
      if (a >= minA) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null; // nothing opaque
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function prepForClip(inputCanvas, opts = {}) {
  // opts: { alphaBg=true, alphaTol=28, padPct=0.06, embedBg='#fff', bgColor:[r,g,b] }
  const { width: W, height: H } = inputCanvas;
  const padPct = Number.isFinite(opts.padPct) ? opts.padPct : 0.06;

  // Work copy
  const work = createCanvas(W, H);
  work.getContext('2d').drawImage(inputCanvas, 0, 0);

  // 1) Punch flat background to alpha
  let imgData = null;
  if (opts.alphaBg !== false) {
    const bg = opts.bgColor
      ? { r: opts.bgColor[0], g: opts.bgColor[1], b: opts.bgColor[2] }
      : sampleEdgeColor(work);
    imgData = toAlpha(work, bg, opts.alphaTol ?? 28);
  } else {
    imgData = work.getContext('2d', { willReadFrequently: true }).getImageData(0,0,W,H);
  }

  // 2) Tight bbox around non-transparent pixels
  let box = alphaBBox(imgData, W, H, 8);
  if (!box) box = { x: 0, y: 0, w: W, h: H };

  // 3) Pad bbox
  const pad = Math.round(padPct * Math.max(box.w, box.h));
  const x = clamp(box.x - pad, 0, W-1);
  const y = clamp(box.y - pad, 0, H-1);
  const w = clamp(box.w + pad*2, 1, W - x);
  const h = clamp(box.h + pad*2, 1, H - y);

  // 4) Crop to bbox for both preview & embed
  const crop = createCanvas(w, h);
  crop.getContext('2d').drawImage(work, x, y, w, h, 0, 0, w, h);

  // 5) Build 224×224 canvases
  const size = 224;
  const preview = createCanvas(size, size); // transparent
  const embed   = createCanvas(size, size); // composited bg for CLIP
  const pctx = preview.getContext('2d');
  const ectx = embed.getContext('2d');

  // contain fit
  const scale = Math.min(size / w, size / h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  const dx = (size - nw) >> 1;
  const dy = (size - nh) >> 1;

  // Embed background: neutral (default white)
  const bg = opts.embedBg || '#ffffff';
  ectx.fillStyle = bg;
  ectx.fillRect(0, 0, size, size);

  // Draw sprite
  pctx.drawImage(crop, 0, 0, w, h, dx, dy, nw, nh);
  ectx.drawImage(crop, 0, 0, w, h, dx, dy, nw, nh);

  return { previewCanvas: preview, embedCanvas: embed };
}
