// src/utils/phash.js
// Canvas-based hashing utilities: aHash, dHash, pHash (DCT), EdgeHash (Sobel)

export function computeAhash64(canvas, grayscale = true, channel = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pix = samplePixels(data, width, height, grayscale, channel);
  const avg = pix.reduce((a,b)=>a+b,0) / pix.length;
  let bits = 0n;
  for (let i=0;i<pix.length;i++) bits = (bits<<1n) | (pix[i] >= avg ? 1n : 0n);
  return bitsToHex64(bits);
}

export function computeDhash64(canvas, mode='x', grayscale=true, size={w:9,h:8}, channel=null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pix = samplePixels(data, width, height, grayscale, channel);
  let bits = 0n;
  const w = size.w, h = size.h;
  if (mode === 'x') {
    for (let y=0;y<h;y++) for (let x=0;x<w-1;x++) {
      bits = (bits<<1n) | (pix[y*w+x] < pix[y*w+x+1] ? 1n : 0n);
    }
  } else {
    for (let y=0;y<h-1;y++) for (let x=0;x<w;x++) {
      bits = (bits<<1n) | (pix[y*w+x] < pix[(y+1)*w+x] ? 1n : 0n);
    }
  }
  return bitsToHex64(bits);
}

export function computePHash64(canvas) {
  // DCT-II 32x32 -> take top-left 8x8 block
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const gray = samplePixels(data, 32, 32, true, null);
  const mat = new Array(32);
  for (let i=0;i<32;i++) mat[i] = gray.slice(i*32,(i+1)*32).map(v=>v/255);
  const dct = dct2(mat);
  const block = [];
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) block.push(dct[y][x]);
  // median of AC coefficients (skip DC minimally improves robustness)
  const ac = block.slice(1);
  const sorted = ac.slice().sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  let bits = 0n;
  for (let i=0;i<64;i++) {
    const v = block[i];
    bits = (bits<<1n) | (v >= median ? 1n : 0n);
  }
  return bitsToHex64(bits);
}

export function computeEdgeHash64(canvas) {
  // Sobel gradient magnitude -> downsample to 8x8 -> aHash over edges
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = samplePixels(data, w, h, true, null);
  const mag = sobelMag(gray, w, h);
  const pooled = avgPool(mag, w, h, 8, 8);
  const avg = pooled.reduce((a,b)=>a+b,0) / pooled.length;
  let bits = 0n;
  for (let i=0;i<pooled.length;i++) bits = (bits<<1n) | (pooled[i] >= avg ? 1n : 0n);
  return bitsToHex64(bits);
}

// --- helpers ---
function samplePixels(data, w, h, grayscale, channel) {
  const out = new Array(w*h);
  for (let i=0;i<w*h;i++) {
    const r = data[i*4+0], g = data[i*4+1], b = data[i*4+2];
    if (grayscale) out[i] = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
    else if (channel === 'R') out[i] = r;
    else if (channel === 'G') out[i] = g;
    else if (channel === 'B') out[i] = b;
    else out[i] = ((r+g+b)/3)|0;
  }
  return out;
}

function dct2(f) {
  const N = f.length, M = f[0].length;
  const F = Array.from({length:N},()=>Array(M).fill(0));
  const c = (n) => (n===0 ? Math.SQRT1_2 : 1);
  for (let u=0; u<N; u++) {
    for (let v=0; v<M; v++) {
      let sum = 0;
      for (let x=0; x<N; x++) {
        for (let y=0; y<M; y++) {
          sum += f[x][y] * Math.cos(((2*x+1)*u*Math.PI)/(2*N)) * Math.cos(((2*y+1)*v*Math.PI)/(2*M));
        }
      }
      F[u][v] = 0.25 * c(u) * c(v) * sum;
    }
  }
  return F;
}

function sobelMag(gray, w, h) {
  const mag = new Array(w*h).fill(0);
  const gxk = [-1,0,1,-2,0,2,-1,0,1];
  const gyk = [-1,-2,-1,0,0,0,1,2,1];
  for (let y=1;y<h-1;y++) {
    for (let x=1;x<w-1;x++) {
      let gx=0, gy=0, k=0;
      for (let j=-1;j<=1;j++) {
        for (let i=-1;i<=1;i++) {
          const v = gray[(y+j)*w + (x+i)];
          gx += v * gxk[k];
          gy += v * gyk[k];
          k++;
        }
      }
      mag[y*w+x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function avgPool(arr, w, h, outW, outH) {
  const out = new Array(outW*outH).fill(0);
  const sx = w / outW, sy = h / outH;
  for (let oy=0; oy<outH; oy++) {
    for (let ox=0; ox<outW; ox++) {
      const x0 = Math.floor(ox*sx), x1 = Math.floor((ox+1)*sx);
      const y0 = Math.floor(oy*sy), y1 = Math.floor((oy+1)*sy);
      let sum=0, cnt=0;
      for (let y=y0; y<y1; y++) for (let x=x0; x<x1; x++) { sum += arr[y*w+x]; cnt++; }
      out[oy*outW+ox] = cnt ? sum/cnt : 0;
    }
  }
  return out;
}

function bitsToHex64(bitsBig) {
  return bitsBig.toString(16).padStart(16, '0');
}
