// src/utils/image.js
// Detect outer frame → equal 5×5 subdivision → crop square interiors (native size).

const ANALYZE_MAX = 900;   // analysis downscale cap (doesn't affect crop resolution)
const EDGE_T = 26;         // gradient threshold (try 22–34 if needed)
const SMOOTH_W = 9;        // smoothing window for projections
const LINE_INNER_OFFSET = 2;   // px inside detected border (full-res)
const CELL_INSET_FRAC = 0.08;  // 8% inset within each cell

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(u); reject(e); };
    img.src = u;
  });
}

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

// Find outer frame only (left/right/top/bottom) reliably.
function detectOuterFrame(im) {
  const gray = toGray(im);
  const { col, row } = sobelProjections(gray);
  const colS = smooth1D(col);
  const rowS = smooth1D(row);

  const w = im.width, h = im.height;

  // strongest near edges
  const left  = argmaxRange(colS, 0, Math.floor(w*0.25));
  const right = argmaxRange(colS, Math.floor(w*0.75), w);
  const top   = argmaxRange(rowS, 0, Math.floor(h*0.25));
  const bottom= argmaxRange(rowS, Math.floor(h*0.75), h);

  // enforce order & minimum widths
  const L = Math.max(0, Math.min(left, right-10));
  const R = Math.min(w-1, Math.max(right, L+10));
  const T = Math.max(0, Math.min(top, bottom-10));
  const B = Math.min(h-1, Math.max(bottom, T+10));

  return { L, R, T, B, colS, rowS };
}

export async function crop25(img) {
  // analysis-only scale
  const W = img.width, H = img.height;
  const scale = Math.min(1, ANALYZE_MAX / Math.max(W, H));
  const aW = Math.max(1, Math.round(W*scale));
  const aH = Math.max(1, Math.round(H*scale));

  const analyzeCanvas = toCanvasFromImage(img, aW, aH);
  const aData = getImageData(analyzeCanvas);

  const { L, R, T, B } = detectOuterFrame(aData);

  const inv = scale ? (1/scale) : 1;
  // back to full-res + step inside lines
  const innerL = Math.max(0, Math.round(L*inv) + LINE_INNER_OFFSET);
  const innerR = Math.min(W, Math.round(R*inv) - LINE_INNER_OFFSET);
  const innerT = Math.max(0, Math.round(T*inv) + LINE_INNER_OFFSET);
  const innerB = Math.min(H, Math.round(B*inv) - LINE_INNER_OFFSET);

  const boardW = Math.max(1, innerR - innerL);
  const boardH = Math.max(1, innerB - innerT);

  const stepX = boardW / 5;
  const stepY = boardH / 5;

  const full = toCanvasFromImage(img, W, H);
  const urls = [];

  for (let r=0; r<5; r++) {
    for (let c=0; c<5; c++) {
      const x0 = innerL + c * stepX;
      const y0 = innerT + r * stepY;

      // square interior centered in cell
      const w = stepX, h = stepY;
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

  // DEBUG overlay: green rectangle + inner grid (press close to remove)
  try {
    if (/[?&]debug(=1|&|$)/.test(location.search)) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position:'fixed', inset:'10px', background:'rgba(0,0,0,.65)', color:'#ddd',
        font:'12px/1.4 system-ui,Segoe UI,Arial', padding:'10px', borderRadius:'10px',
        zIndex:9999, pointerEvents:'auto', maxWidth:'420px'
      });
      overlay.innerHTML = '<b>Grid debug</b><div id="dbg"></div><button id="x" style="margin-top:8px">close</button>';
      document.body.appendChild(overlay);
      overlay.querySelector('#x').onclick = () => overlay.remove();

      const vis = document.createElement('canvas');
      vis.width = aW; vis.height = aH;
      const ctx = vis.getContext('2d');
      ctx.drawImage(analyzeCanvas,0,0);

      // draw outer
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
      ctx.strokeRect(L, T, R-L, B-T);

      // draw inner equal grid
      ctx.strokeStyle = '#00ffa8'; ctx.lineWidth = 1;
      for (let i=1;i<5;i++) {
        const x = L + (R-L)*i/5;
        const y = T + (B-T)*i/5;
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      }

      overlay.querySelector('#dbg').appendChild(vis);
    }
  } catch {}

  return urls;
}
