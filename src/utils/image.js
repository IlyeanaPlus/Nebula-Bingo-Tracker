// src/utils/image.js
// Outer-frame detection → optional calibrated inner grid via green overlay →
// crop *square* interiors at native resolution (no scaling).

// ---------- Tunables ----------
const ANALYZE_MAX = 900;       // analysis downscale cap (does not affect crop resolution)
const EDGE_T = 26;             // gradient threshold for outer-frame detection (try 22–34)
const SMOOTH_W = 9;            // smoothing window for projections
const LINE_INNER_OFFSET = 2;   // px stepped inside detected outer border (full-res)
const CELL_INSET_FRAC = 0.08;  // 8% inset within each cell to avoid gridlines

// ---------- Public: file -> HTMLImageElement ----------
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(u); reject(e); };
    img.src = u;
  });
}

// ---------- Canvas helpers ----------
function toCanvasFromImage(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
function getImageData(cnv) {
  return cnv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cnv.width, cnv.height);
}
function cropToDataURLNative(srcCanvas, sx, sy, sw, sh) {
  const out = document.createElement('canvas');
  out.width  = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  out.getContext('2d', { willReadFrequently: true }).drawImage(
    srcCanvas,
    Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
    0, 0, out.width, out.height
  );
  return out.toDataURL('image/png');
}

// ---------- Grayscale + Sobel projections (outer frame) ----------
function toGray(im) {
  const { data, width:w, height:h } = im;
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    g[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return { g, w, h };
}
function sobelProjections(gray) {
  const { g, w, h } = gray;
  const col = new Float32Array(w);
  const row = new Float32Array(h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i  = y * w + x;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]
               +  g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]
               +  g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      const magX = Math.abs(gx);
      const magY = Math.abs(gy);
      if (magX > EDGE_T) col[x] += magX;   // vertical line energy
      if (magY > EDGE_T) row[y] += magY;   // horizontal line energy
    }
  }
  return { col, row };
}
function smooth1D(arr, win = SMOOTH_W) {
  const n = arr.length, out = new Float32Array(n);
  const w = Math.max(1, win | 0), half = (w - 1) >> 1;
  let sum = 0;
  for (let i = 0; i < n + half; i++) {
    const add = i < n ? arr[i] : 0;
    const sub = (i - w >= 0) ? arr[i - w] : 0;
    sum += add - sub;
    if (i >= half) {
      const idx = i - half;
      if (idx < n) out[idx] = sum / Math.min(w, idx + half + 1, n - (idx - half));
    }
  }
  return out;
}
function argmaxRange(arr, lo, hi) {
  lo = Math.max(0, lo | 0); hi = Math.min(arr.length, hi | 0);
  let best = lo, bestV = -Infinity;
  for (let i = lo; i < hi; i++) { if (arr[i] > bestV) { best = i; bestV = arr[i]; } }
  return best;
}

// Detect only the outer frame (left/right/top/bottom) robustly.
function detectOuterFrame(im) {
  const gray = toGray(im);
  const { col, row } = sobelProjections(gray);
  const colS = smooth1D(col);
  const rowS = smooth1D(row);
  const w = im.width, h = im.height;

  const left   = argmaxRange(colS, 0, Math.floor(w * 0.25));
  const right  = argmaxRange(colS, Math.floor(w * 0.75), w);
  const top    = argmaxRange(rowS, 0, Math.floor(h * 0.25));
  const bottom = argmaxRange(rowS, Math.floor(h * 0.75), h);

  // enforce order & minimum width/height
  const L = Math.max(0, Math.min(left, right - 10));
  const R = Math.min(w - 1, Math.max(right, L + 10));
  const T = Math.max(0, Math.min(top, bottom - 10));
  const B = Math.min(h - 1, Math.max(bottom, T + 10));
  return { L, R, T, B };
}

// ---------- Calibration via green overlay (robust to 1px AA lines) ----------
function extractFractionsFromOverlayImage(overlayImg) {
  const w = overlayImg.width, h = overlayImg.height;
  const cnv = toCanvasFromImage(overlayImg, w, h);
  const { data } = getImageData(cnv);

  // Count green-dominant pixels per column/row
  const colHits = new Float32Array(w);
  const rowHits = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 64) continue;
      // Green-dominant (tolerant of anti-aliased neon)
      if (g > 100 && g > r * 1.4 && g > b * 1.4) {
        colHits[x] += 1;
        rowHits[y] += 1;
      }
    }
  }

  // 1D dilation to thicken 1px lines
  function dilate1D(arr) {
    const n = arr.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? arr[i - 1] : 0;
      const b = arr[i];
      const c = i + 1 < n ? arr[i + 1] : 0;
      out[i] = a + b + c;
    }
    return out;
  }
  const colScore = dilate1D(colHits);
  const rowScore = dilate1D(rowHits);

  // Light smoothing
  function smooth1(arr, win = 5) {
    const n = arr.length, out = new Float32Array(n);
    const half = Math.max(0, (win | 0) - 1) >> 1;
    let sum = 0;
    for (let i = 0; i < n + half; i++) {
      const add = i < n ? arr[i] : 0;
      const sub = i - (2 * half + 1) >= 0 ? arr[i - (2 * half + 1)] : 0;
      sum += add - sub;
      if (i >= half) {
        const idx = i - half;
        if (idx < n) out[idx] = sum / Math.min(2 * half + 1, idx + half + 1, n - (idx - half));
      }
    }
    return out;
  }
  const colSmooth = smooth1(colScore, 5);
  const rowSmooth = smooth1(rowScore, 5);

  // Pick exactly 6 peaks with non-max suppression
  function topKPeaksNMS(arr, K, radius = 3) {
    const idxs = Array.from({ length: arr.length }, (_, i) => i)
      .sort((a, b) => arr[b] - arr[a]);
    const chosen = [];
    const taken = new Uint8Array(arr.length);
    for (const i of idxs) {
      if (arr[i] <= 0) break;
      if (taken[i]) continue;
      chosen.push(i);
      for (let d = -radius; d <= radius; d++) {
        const j = i + d;
        if (j >= 0 && j < taken.length) taken[j] = 1;
      }
      if (chosen.length === K) break;
    }
    return chosen.sort((a, b) => a - b);
  }

  let xCenters = topKPeaksNMS(colSmooth, 6, 3);
  let yCenters = topKPeaksNMS(rowSmooth, 6, 3);

  console.log('Overlay found lines:', xCenters.length, yCenters.length);
  if (xCenters.length !== 6 || yCenters.length !== 6) {
    console.warn('⚠ Overlay parse did not find 6x6. Got', xCenters, yCenters);
  }

  // Fractions inside the overlay’s own outer frame
  const L = xCenters[0], R = xCenters[xCenters.length - 1];
  const T = yCenters[0], B = yCenters[yCenters.length - 1];
  const xFracs = xCenters.map(x => (x - L) / (R - L || 1));
  const yFracs = yCenters.map(y => (y - T) / (B - T || 1));

  return { xFracs, yFracs };
}

// Save/load calibration
function saveGridFractions(fracs) {
  localStorage.setItem('nbt.gridFractions', JSON.stringify(fracs));
}
function loadGridFractions() {
  try {
    const raw = localStorage.getItem('nbt.gridFractions');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Console helpers (must be triggered by a user gesture in some browsers)
window.NebulaLoadGridOverlay = async function(file) {
  const img = await fileToImage(file);
  const fracs = extractFractionsFromOverlayImage(img);
  saveGridFractions(fracs);
  console.log('Saved grid fractions:', fracs);
};
window.NebulaPickGridOverlay = function() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/*';
  inp.onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await window.NebulaLoadGridOverlay(f);
    alert('Grid overlay loaded and fractions saved. Run Fill again.');
  };
  document.body.appendChild(inp);
  inp.style.position = 'fixed';
  inp.style.inset = '0';
  inp.style.opacity = '0';
  inp.click();
  setTimeout(() => inp.remove(), 0);
};

// ---------- Public: crop25 (native-size crops) ----------
export async function crop25(img) {
  // analysis-only scale
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W * scale));
  const aH = Math.max(1, Math.round(H * scale));

  const aCanvas = toCanvasFromImage(img, aW, aH);
  const aData = getImageData(aCanvas);

  // detect outer frame (analysis space)
  const { L, R, T, B } = detectOuterFrame(aData);

  // map to full-res + step inside lines
  const inv = 1 / scale;
  const innerL = Math.max(0, Math.round(L * inv) + LINE_INNER_OFFSET);
  const innerR = Math.min(W, Math.round(R * inv) - LINE_INNER_OFFSET);
  const innerT = Math.max(0, Math.round(T * inv) + LINE_INNER_OFFSET);
  const innerB = Math.min(H, Math.round(B * inv) - LINE_INNER_OFFSET);

  const frameW = Math.max(1, innerR - innerL);
  const frameH = Math.max(1, innerB - innerT);

  // Use calibrated fractions if present
  const fr = loadGridFractions();
  let xCenters, yCenters;
  if (fr && Array.isArray(fr.xFracs) && fr.xFracs.length === 6 &&
      Array.isArray(fr.yFracs) && fr.yFracs.length === 6) {
    xCenters = fr.xFracs.map(f => innerL + f * frameW);
    yCenters = fr.yFracs.map(f => innerT + f * frameH);
  } else {
    // fallback: equal spacing
    xCenters = Array.from({ length: 6 }, (_, i) => innerL + (frameW * i) / 5);
    yCenters = Array.from({ length: 6 }, (_, i) => innerT + (frameH * i) / 5);
  }

  // centers -> 6 boundaries (bracketing 5 cells)
  const toBounds = (c, max) => {
    const B = new Array(6);
    B[0] = Math.max(0, Math.round(c[0] - (c[1] - c[0]) / 2));
    for (let i = 1; i < 5; i++) B[i] = Math.round((c[i - 1] + c[i]) / 2);
    B[5] = Math.min(max - 1, Math.round(c[5] + (c[5] - c[4]) / 2));
    for (let i = 1; i < 6; i++) if (B[i] <= B[i - 1]) B[i] = B[i - 1] + 1;
    return B;
  };
  const X = toBounds(xCenters, W);
  const Y = toBounds(yCenters, H);

  // crop 25 squares
  const full = toCanvasFromImage(img, W, H);
  const urls = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x0 = X[c], x1 = X[c + 1];
      const y0 = Y[r], y1 = Y[r + 1];
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      const side = Math.min(w, h);
      let cx = x0 + (w - side) / 2;
      let cy = y0 + (h - side) / 2;
      const inset = side * CELL_INSET_FRAC;
      cx += inset; cy += inset;
      const sw = Math.max(1, side - inset * 2);
      const sh = sw;
      urls.push(cropToDataURLNative(full, cx, cy, sw, sh));
    }
  }

  // Debug overlay (analysis space)
  try {
    if (/[?&]debug(=1|&|$)/.test(location.search)) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', inset: '10px', background: 'rgba(0,0,0,.65)', color: '#ddd',
        font: '12px/1.4 system-ui,Segoe UI,Arial', padding: '10px', borderRadius: '10px',
        zIndex: 9999, pointerEvents: 'auto', maxWidth: '420px'
      });
      overlay.innerHTML = '<b>Grid debug</b><div id="dbg"></div><div style="margin-top:6px;opacity:.8">'
        + (fr ? 'using <b>calibrated</b> fractions' : 'using <b>equal</b> fractions')
        + '</div><button id="x" style="margin-top:8px">close</button>';
      document.body.appendChild(overlay);
      overlay.querySelector('#x').onclick = () => overlay.remove();

      const vis = document.createElement('canvas');
      vis.width = aW; vis.height = aH;
      const ctx = vis.getContext('2d');
      ctx.drawImage(aCanvas, 0, 0);

      // draw outer in analysis space
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(L, T, R - L, B - T);

      // draw inner grid (map full-res bounds back by scale)
      ctx.strokeStyle = '#00ffa8'; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const x = Math.round(X[i] * scale);
        const y = Math.round(Y[i] * scale);
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      }
      overlay.querySelector('#dbg').appendChild(vis);
    }
  } catch {}

  return urls;
}
