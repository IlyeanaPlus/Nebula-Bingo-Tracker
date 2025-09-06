// src/utils/image.js
// Detect the outer 5x5 grid with spacing-regularized line picking,
// then crop *square* interiors with a small inset.
// Returns 25 PNG dataURLs at native size (no resampling).

const ANALYZE_MAX = 900;   // analysis downscale cap (higher = more precise)
const EDGE_T = 28;         // gradient magnitude threshold (tune 22–40)
const SMOOTH_W = 11;       // odd window for smoothing projections
const EXPECTED = 6;        // 6 lines per axis for a 5x5 grid
const LINE_INNER_OFFSET = 2;   // px inside the detected border (full-res)
const CELL_INSET_FRAC = 0.08;  // 8% inset inside each cell
const SPACING_LAMBDA = 0.002;  // spacing penalty weight (↑ = more equal spacing)

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

// ---------- grayscale + gradients ----------
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

  // Sobel kernels (approx) for edges orthogonal to axis
  // vertical lines -> strong Gx along x-derivative
  for (let y=1;y<h-1;y++) {
    for (let x=1;x<w-1;x++) {
      const i = y*w + x;
      const gx =
        -g[i-w-1] - 2*g[i-1] - g[i+w-1] +
         g[i-w+1] + 2*g[i+1] + g[i+w+1];
      const mag = Math.abs(gx);
      if (mag > EDGE_T) col[x] += mag;
    }
  }
  // horizontal lines -> strong Gy along y-derivative
  for (let y=1;y<h-1;y++) {
    for (let x=1;x<w-1;x++) {
      const i = y*w + x;
      const gy =
        -g[i-w-1] - 2*g[i-w] - g[i-w+1] +
         g[i+w-1] + 2*g[i+w] + g[i+w+1];
      const mag = Math.abs(gy);
      if (mag > EDGE_T) row[y] += mag;
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

// ---------- pick exactly 6 peaks with spacing regularization ----------
function pick6Regularized(scores) {
  const n = scores.length;
  const K = EXPECTED;
  // simple DP over positions: dp[k][i] = best up to i choosing k peaks, with last at i
  const dp = Array.from({length:K},()=>new Float64Array(n).fill(-1e18));
  const prev = Array.from({length:K},()=>new Int32Array(n).fill(-1));

  // k=0 initialization: choose first line anywhere; mild penalty to be near edges avoided
  for (let i=0;i<n;i++) dp[0][i] = scores[i];

  for (let k=1;k<K;k++) {
    for (let i=k;i<n-(K-1-k);i++) {
      // choose previous j<i
      let bestVal = -1e18, bestJ = -1;
      for (let j=k-1;j<i;j++) {
        const gap = i - j;
        // expected average gap if evenly spaced
        const ideal = (n-1)/(K-1);
        const penalty = SPACING_LAMBDA * (gap - ideal) * (gap - ideal);
        const val = dp[k-1][j] + scores[i] - penalty;
        if (val > bestVal) { bestVal = val; bestJ = j; }
      }
      dp[k][i] = bestVal;
      prev[k][i] = bestJ;
    }
  }
  // backtrack
  let bestI = 0, bestVal = -1e18;
  for (let i=K-1;i<n;i++) if (dp[K-1][i] > bestVal) { bestVal = dp[K-1][i]; bestI = i; }
  const picks = new Array(K);
  let k = K-1, i = bestI;
  while (k>=0 && i>=0) {
    picks[k] = i;
    i = prev[k][i];
    k--;
  }
  return picks;
}

// ---------- main detection ----------
function detectFrameAndBounds(im) {
  const gray = toGray(im);
  const { col, row } = sobelProjections(gray);
  const colS = smooth1D(col);
  const rowS = smooth1D(row);

  let xLines = pick6Regularized(colS);
  let yLines = pick6Regularized(rowS);

  // convert 6 centers → 6 boundaries that bracket the 5 cells
  const toBounds = (lines, max) => {
    const B = new Array(6);
    B[0] = Math.max(0, Math.round(lines[0] - (lines[1] - lines[0]) / 2));
    for (let i=1;i<5;i++) B[i] = Math.round((lines[i-1] + lines[i]) / 2);
    B[5] = Math.min(max-1, Math.round(lines[5] + (lines[5] - lines[4]) / 2));
    // ensure monotonic
    for (let i=1;i<6;i++) if (B[i] <= B[i-1]) B[i] = B[i-1] + 1;
    return B;
  };

  const xB = toBounds(xLines, im.width);
  const yB = toBounds(yLines, im.height);
  return { xLines, yLines, xB, yB, colS, rowS };
}

// ---------- Public: crop25 ----------
export async function crop25(img) {
  // analysis scale (does not affect crop resolution)
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W * scale));
  const aH = Math.max(1, Math.round(H * scale));

  const aCanvas = toCanvasFromImage(img, aW, aH);
  const aData = getImageData(aCanvas);
  const { xB, yB, xLines, yLines } = detectFrameAndBounds(aData);

  const inv = scale ? (1/scale) : 1;
  // map bounds to full-res & step inside outer lines
  const X = xB.map(v => Math.round(v * inv));
  const Y = yB.map(v => Math.round(v * inv));
  X[0] += LINE_INNER_OFFSET; Y[0] += LINE_INNER_OFFSET;
  X[5] -= LINE_INNER_OFFSET; Y[5] -= LINE_INNER_OFFSET;

  // equal 5x5 by construction: consecutive bounds define cells
  const full = toCanvasFromImage(img, W, H);
  const urls = [];

  for (let r=0;r<5;r++) {
    for (let c=0;c<5;c++) {
      const x0 = X[c],   x1 = X[c+1];
      const y0 = Y[r],   y1 = Y[r+1];
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
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

  // ---- OPTIONAL DEBUG OVERLAY ----
  try {
    if (/[?&]debug(=1|&|$)/.test(location.search)) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position:'fixed', inset:'10px', background:'rgba(0,0,0,.65)', color:'#ddd',
        font:'12px/1.4 system-ui,Segoe UI,Arial', padding:'10px', borderRadius:'10px',
        zIndex: 9999, pointerEvents:'auto', maxWidth:'420px', overflow:'auto'
      });
      overlay.innerHTML = '<b>Grid debug</b><div id="griddbg"></div><button id="gridclose" style="margin-top:8px">close</button>';
      document.body.appendChild(overlay);
      overlay.querySelector('#gridclose').onclick = () => overlay.remove();

      // draw analysis with lines
      const vis = document.createElement('canvas');
      vis.width = aW; vis.height = aH;
      const vctx = vis.getContext('2d');
      vctx.drawImage(aCanvas, 0, 0);
      vctx.strokeStyle = '#00ff88'; vctx.lineWidth = 1;
      for (const x of xLines) { vctx.beginPath(); vctx.moveTo(x,0); vctx.lineTo(x,aH); vctx.stroke(); }
      for (const y of yLines) { vctx.beginPath(); vctx.moveTo(0,y); vctx.lineTo(aW,y); vctx.stroke(); }
      overlay.querySelector('#griddbg').appendChild(vis);
    }
  } catch {}

  return urls;
}
