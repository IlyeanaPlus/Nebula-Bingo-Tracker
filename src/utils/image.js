// src/utils/image.js
// Outer-frame detection + optional overlay calibration (green lines) for exact inner grid.
// Returns 25 native-size PNG dataURLs (no scaling).

const ANALYZE_MAX = 900;     // analysis downscale cap
const EDGE_T = 26;           // gradient threshold for outer frame
const SMOOTH_W = 9;          // smoothing window
const LINE_INNER_OFFSET = 2; // px inside detected border (full-res)
const CELL_INSET_FRAC = 0.08;// 8% inset inside each cell

// ---------- public: file -> image ----------
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(u); reject(e); };
    img.src = u;
  });
}

// ---------- canvas helpers ----------
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
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  out.getContext('2d', { willReadFrequently: true }).drawImage(
    srcCanvas,
    Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
    0, 0, out.width, out.height
  );
  return out.toDataURL('image/png');
}

// ---------- grayscale + gradients for outer frame ----------
function toGray(im) {
  const { data, width:w, height:h } = im;
  const g = new Float32Array(w*h);
  for (let i=0,p=0;i<data.length;i+=4,p++) {
    g[p] = 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
  }
  return { g, w, h };
}
function sobelProjections(gray) {
  const { g, w, h } = gray;
  const col = new Float32Array(w);
  const row = new Float32Array(h);

  for (let y=1;y<h-1;y++) {
    for (let x=1;x<w-1;x++) {
      const i = y*w + x;
      const gx = -g[i-w-1] - 2*g[i-1] - g[i+w-1] + g[i-w+1] + 2*g[i+1] + g[i+w+1];
      const gy = -g[i-w-1] - 2*g[i-w] - g[i-w+1] + g[i+w-1] + 2*g[i+w] + g[i+w+1];
      const magX = Math.abs(gx);
      const magY = Math.abs(gy);
      if (magX > EDGE_T) col[x] += magX;
      if (magY > EDGE_T) row[y] += magY;
    }
  }
  return { col, row };
}
function smooth1D(arr, win=SMOOTH_W) {
  const n = arr.length, out = new Float32Array(n);
  const w = Math.max(1, win|0), half = (w-1)>>1;
  let sum = 0;
  for (let i=0;i<n+half;i++) {
    const add = i<n ? arr[i] : 0;
    const sub = (i-w>=0) ? arr[i-w] : 0;
    sum += add - sub;
    if (i>=half) {
      const idx = i-half;
      if (idx<n) out[idx] = sum / Math.min(w, idx+half+1, n-(idx-half));
    }
  }
  return out;
}
function argmaxRange(arr, lo, hi) {
  lo = Math.max(0, lo|0); hi = Math.min(arr.length, hi|0);
  let best = lo, bestV = -Infinity;
  for (let i=lo;i<hi;i++) { if (arr[i] > bestV) { best = i; bestV = arr[i]; } }
  return best;
}

// Detect only the outer frame (left/right/top/bottom) robustly.
function detectOuterFrame(im) {
  const gray = toGray(im);
  const { col, row } = sobelProjections(gray);
  const colS = smooth1D(col);
  const rowS = smooth1D(row);
  const w = im.width, h = im.height;

  const left  = argmaxRange(colS, 0, Math.floor(w*0.25));
  const right = argmaxRange(colS, Math.floor(w*0.75), w);
  const top   = argmaxRange(rowS, 0, Math.floor(h*0.25));
  const bottom= argmaxRange(rowS, Math.floor(h*0.75), h);

  const L = Math.max(0, Math.min(left, right-10));
  const R = Math.min(w-1, Math.max(right, L+10));
  const T = Math.max(0, Math.min(top, bottom-10));
  const B = Math.min(h-1, Math.max(bottom, T+10));
  return { L, R, T, B, colS, rowS };
}

// ---------- overlay calibration (green lines) ----------
function extractFractionsFromOverlayImage(overlayImg) {
  // Expect overlay drawn over the board with bright green lines.
  const w = overlayImg.width, h = overlayImg.height;
  const cnv = toCanvasFromImage(overlayImg, w, h);
  const { data } = getImageData(cnv);

  const colGreen = new Uint32Array(w);
  const rowGreen = new Uint32Array(h);

  for (let y=0; y<h; y++) {
    for (let x=0; x<w; x++) {
      const i = (y*w + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      // "green-enough" (tweak if needed)
      if (a > 0 && g >= 200 && r <= 80 && b <= 120) {
        colGreen[x]++; rowGreen[y]++;
      }
    }
  }
  // find contiguous runs -> center per line
  const centersFromRuns = (arr) => {
    const centers = [];
    let runStart = -1;
    for (let i=0; i<arr.length; i++) {
      if (arr[i] > 0) {
        if (runStart === -1) runStart = i;
      } else if (runStart !== -1) {
        const mid = Math.round((runStart + (i-1)) / 2);
        centers.push(mid);
        runStart = -1;
      }
    }
    if (runStart !== -1) centers.push(Math.round((runStart + arr.length-1)/2));
    return centers.sort((a,b)=>a-b);
  };

  const xCenters = centersFromRuns(colGreen);
  const yCenters = centersFromRuns(rowGreen);
  if (xCenters.length !== 6 || yCenters.length !== 6) {
    console.warn('Overlay parse did not find 6x6 lines. Found:', xCenters.length, yCenters.length);
  }

  // compute outer frame from extremes
  const L = xCenters[0], R = xCenters[5], T = yCenters[0], B = yCenters[5];
  const xFracs = xCenters.map(x => (x - L) / (R - L));
  const yFracs = yCenters.map(y => (y - T) / (B - T));

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

// Expose console helpers
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
  };
  inp.click();
};

// ---------- Public: crop25 ----------
export async function crop25(img) {
  // analysis-only scale (does not affect crop resolution)
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W*scale));
  const aH = Math.max(1, Math.round(H*scale));

  const aCanvas = toCanvasFromImage(img, aW, aH);
  const aData = getImageData(aCanvas);

  // Detect outer frame on analysis image
  const { L, R, T, B } = detectOuterFrame(aData);

  // Map to full-res + step inside the lines
  const inv = scale ? (1/scale) : 1;
  const innerL = Math.max(0, Math.round(L*inv) + LINE_INNER_OFFSET);
  const innerR = Math.min(W, Math.round(R*inv) - LINE_INNER_OFFSET);
  const innerT = Math.max(0, Math.round(T*inv) + LINE_INNER_OFFSET);
  const innerB = Math.min(H, Math.round(B*inv) - LINE_INNER_OFFSET);

  const frameW = Math.max(1, innerR - innerL);
  const frameH = Math.max(1, innerB - innerT);

  // Use calibrated fractions if present
  const fr = loadGridFractions();
  let xCenters = null, yCenters = null;

  if (fr && Array.isArray(fr.xFracs) && fr.xFracs.length === 6 &&
      Array.isArray(fr.yFracs) && fr.yFracs.length === 6) {
    xCenters = fr.xFracs.map(f => innerL + f * frameW);
    yCenters = fr.yFracs.map(f => innerT + f * frameH);
  } else {
    // fallback: equal spacing
    xCenters = Array.from({length:6}, (_,i)=> innerL + (frameW * i)/5);
    yCenters = Array.from({length:6}, (_,i)=> innerT + (frameH * i)/5);
  }

  // Convert centers -> boundaries and crop
  const toBounds = (c, max) => {
    const B = new Array(6);
    B[0] = Math.max(0, Math.round(c[0] - (c[1]-c[0])/2));
    for (let i=1;i<5;i++) B[i] = Math.round((c[i-1] + c[i]) / 2);
    B[5] = Math.min(max-1, Math.round(c[5] + (c[5]-c[4])/2));
    for (let i=1;i<6;i++) if (B[i] <= B[i-1]) B[i] = B[i-1] + 1;
    return B;
  };
  const X = toBounds(xCenters, W);
  const Y = toBounds(yCenters, H);

  const full = toCanvasFromImage(img, W, H);
  const urls = [];
  for (let r=0; r<5; r++) {
    for (let c=0; c<5; c++) {
      const x0 = X[c], x1 = X[c+1];
      const y0 = Y[r], y1 = Y[r+1];
      const w = Math.max(1, x1-x0), h = Math.max(1, y1-y0);
      const side = Math.min(w, h);
      let cx = x0 + (w - side)/2;
      let cy = y0 + (h - side)/2;
      const inset = side * CELL_INSET_FRAC;
      cx += inset; cy += inset;
      const sw = Math.max(1, side - inset*2);
      const sh = sw;
      urls.push(cropToDataURLNative(full, cx, cy, sw, sh));
    }
  }

  // Debug overlay
  try {
    if (/[?&]debug(=1|&|$)/.test(location.search)) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position:'fixed', inset:'10px', background:'rgba(0,0,0,.65)', color:'#ddd',
        font:'12px/1.4 system-ui,Segoe UI,Arial', padding:'10px', borderRadius:'10px',
        zIndex:9999, pointerEvents:'auto', maxWidth:'420px'
      });
      overlay.innerHTML = '<b>Grid debug</b><div id="dbg"></div><div style="margin-top:6px;opacity:.8">'
        + (fr ? 'using <b>calibrated</b> fractions' : 'using <b>equal</b> fractions')
        + '</div><button id="x" style="margin-top:8px">close</button>';
      document.body.appendChild(overlay);
      overlay.querySelector('#x').onclick = () => overlay.remove();

      const vis = document.createElement('canvas');
      vis.width = aW; vis.height = aH;
      const ctx = vis.getContext('2d');
      ctx.drawImage(aCanvas,0,0);

      // draw outer (analysis space)
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(L, T, R-L, B-T);

      // draw inner lines (mapped from full-res back to analysis for visualization)
      ctx.strokeStyle = '#00ffa8'; ctx.lineWidth = 1;
      const mapX = v => (v / (1/scale));
      const mapY = v => (v / (1/scale));
      for (let i=1;i<5;i++) {
        const x = mapX(X[i]);
        const y = mapY(Y[i]);
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      }

      overlay.querySelector('#dbg').appendChild(vis);
    }
  } catch {}

  return urls;
}
