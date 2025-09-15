// src/utils/gridRefine.js
// Snap a coarse 5×5 grid box (fractions) to actual grid lines and enforce square cell pitch.

function _toCanvas(img) {
  if (img && typeof img.getContext === "function") return img;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}

function _projEdges(imgData, w, h) {
  const d = imgData.data;
  const vert = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let i = (y * w) * 4;
    let pr = d[i], pg = d[i+1], pb = d[i+2];
    for (let x = 1; x < w; x++) {
      i += 4;
      const r = d[i], g = d[i+1], b = d[i+2];
      const dv = Math.abs(r-pr)+Math.abs(g-pg)+Math.abs(b-pb);
      vert[x] += dv; pr=r; pg=g; pb=b;
    }
  }
  const hori = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    let i = x*4;
    let pr = d[i], pg = d[i+1], pb = d[i+2];
    for (let y = 1; y < h; y++) {
      i = (y*w + x)*4;
      const r = d[i], g = d[i+1], b = d[i+2];
      const dv = Math.abs(r-pr)+Math.abs(g-pg)+Math.abs(b-pb);
      hori[y] += dv; pr=r; pg=g; pb=b;
    }
  }
  return { vert, hori };
}

function _smooth1d(arr, radius) {
  const n = arr.length, out = new Float32Array(n);
  const r = Math.max(1, radius|0);
  for (let i=0;i<n;i++) {
    const a = Math.max(0, i-r), b = Math.min(n-1, i+r);
    let s=0; for (let j=a;j<=b;j++) s += arr[j];
    out[i] = s / (b-a+1);
  }
  return out;
}

function _findPeaks(arr, k, minSep) {
  const n = arr.length;
  const taken = new Array(n).fill(false);
  const peaks = [];
  for (let it=0; it<k; it++) {
    let bestI=-1, bestV=-Infinity;
    for (let i=0;i<n;i++) if (!taken[i] && arr[i] > bestV) { bestV=arr[i]; bestI=i; }
    if (bestI < 0 || bestV <= 0) break;
    peaks.push(bestI);
    const a=Math.max(0,bestI-minSep), b=Math.min(n-1,bestI+minSep);
    for (let j=a;j<=b;j++) taken[j]=true;
  }
  return peaks.sort((a,b)=>a-b);
}

function _clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export async function refineGridFractions(imageOrCanvas, coarse, opts = {}) {
  const rows = opts.rows || 5, cols = opts.cols || 5;
  const cFull = _toCanvas(imageOrCanvas);
  const W = cFull.width|0, H = cFull.height|0;

  // coarse → pixel ROI with a tiny pad
  const leftPx = Math.round(_clip((coarse.left  ?? 0) * W, 0, W-1));
  const topPx  = Math.round(_clip((coarse.top   ?? 0) * H, 0, H-1));
  const wPx    = Math.round(_clip((coarse.width ?? 1) * W, 1, W - leftPx));
  const hPx    = Math.round(_clip((coarse.height?? 1) * H, 1, H - topPx));
  const padX = Math.max(2, Math.round(wPx * 0.01));
  const padY = Math.max(2, Math.round(hPx * 0.01));
  const x0 = _clip(leftPx - padX, 0, W-1);
  const y0 = _clip(topPx  - padY, 0, H-1);
  const x1 = _clip(leftPx + wPx + padX, 0, W);
  const y1 = _clip(topPx  + hPx + padY, 0, H);
  const roiW = Math.max(4, x1 - x0);
  const roiH = Math.max(4, y1 - y0);

  // downsample for fast projections
  const scaleMax = 640;
  const s = Math.min(1, scaleMax / Math.max(roiW, roiH));
  const c = document.createElement("canvas");
  c.width = Math.max(4, Math.round(roiW * s));
  c.height = Math.max(4, Math.round(roiH * s));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cFull, x0, y0, roiW, roiH, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const { vert, hori } = _projEdges(img, c.width, c.height);
  const sv = _smooth1d(vert, Math.round(c.width * 0.01) + 1);
  const sh = _smooth1d(hori, Math.round(c.height * 0.01) + 1);

  const expectedV = cols + 1;
  const expectedH = rows + 1;
  const pitchX = (wPx / cols) * s;
  const pitchY = (hPx / rows) * s;
  const vlines = _findPeaks(sv, expectedV, Math.max(6, Math.round(pitchX * 0.6)));
  const hlines = _findPeaks(sh, expectedH, Math.max(6, Math.round(pitchY * 0.6)));
  if (vlines.length < expectedV || hlines.length < expectedH) {
    return coarse; // fallback gracefully
  }

  // map line 0/last back to full pixels
  let vx0 = x0 + Math.round(vlines[0] / s);
  let vx1 = x0 + Math.round(vlines[vlines.length - 1] / s);
  let vy0 = y0 + Math.round(hlines[0] / s);
  let vy1 = y0 + Math.round(hlines[hlines.length - 1] / s);

  // --- enforce square: equalize pitch ---
  const spanX = (vx1 - vx0);
  const spanY = (vy1 - vy0);
  const px = spanX / cols;
  const py = spanY / rows;
  const p = (px + py) / 2; // target square pitch
  // Adjust the shorter span to match square cells, minimize movement
  if (Math.abs(px - py) > 0.5) {
    if (px > py) { // widen vertical span (y)
      const targetSpanY = p * rows;
      const delta = targetSpanY - spanY; // may be +/-
      vy0 = Math.max(0, Math.round(vy0 - delta/2));
      vy1 = Math.min(H, Math.round(vy1 + delta/2));
    } else {       // widen horizontal span (x)
      const targetSpanX = p * cols;
      const delta = targetSpanX - spanX;
      vx0 = Math.max(0, Math.round(vx0 - delta/2));
      vx1 = Math.min(W, Math.round(vx1 + delta/2));
    }
  }

  // Fractions back
  const out = {
    left:   vx0 / W,
    top:    vy0 / H,
    width:  (vx1 - vx0) / W,
    height: (vy1 - vy0) / H,
  };

  // Optional dev overlay
  try {
    const ov = document.createElement("canvas");
    ov.width = W; ov.height = H;
    const ox = ov.getContext("2d");
    ox.drawImage(cFull, 0, 0);
    ox.strokeStyle = "rgba(0,255,128,0.9)";
    ox.lineWidth = 2;
    ox.strokeRect(vx0 + 0.5, vy0 + 0.5, (vx1 - vx0), (vy1 - vy0));
    const pitch = ( (vx1 - vx0) / cols + (vy1 - vy0) / rows ) / 2;
    for (let i=1;i<cols;i++){ const x=vx0 + Math.round(i*pitch) + 0.5; ox.beginPath(); ox.moveTo(x, vy0); ox.lineTo(x, vy1); ox.stroke(); }
    for (let j=1;j<rows;j++){ const y=vy0 + Math.round(j*pitch) + 0.5; ox.beginPath(); ox.moveTo(vx0, y); ox.lineTo(vx1, y); ox.stroke(); }
    (window.__NBT_DEV = window.__NBT_DEV || {}).gridOverlay = ov.toDataURL("image/png");
  } catch {}

  return out;
}
