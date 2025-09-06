// src/utils/hashing.js
// Browser-side aHash & dHash (64-bit) with optional grayscale or RGB channel modes.
// Returns lowercase hex strings (16 chars).

function loadDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });
}

function toCanvas(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function getChannelValue(r, g, b, grayscale, channel) {
  if (grayscale) {
    // perceptual grayscale (BT.709)
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  switch (channel) {
    case 'R': return r;
    case 'G': return g;
    case 'B': return b;
    default:  return Math.round((r + g + b) / 3);
  }
}

function hexPad64(nBig) {
  let hex = nBig.toString(16);
  if (hex.length < 16) hex = '0'.repeat(16 - hex.length) + hex;
  return hex;
}

// 8x8 aHash → 64 bits
export async function computeAhash64(dataURL, grayscale = true, channel = null) {
  const img = await loadDataURL(dataURL);
  const size = 8;
  const c = toCanvas(img, size, size);
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, size, size);

  const vals = new Array(size * size);
  let sum = 0;
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    const v = getChannelValue(data[idx], data[idx+1], data[idx+2], grayscale, channel);
    vals[i] = v;
    sum += v;
  }
  const avg = sum / (size * size);

  let bits = 0n;
  for (let i = 0; i < vals.length; i++) {
    bits = (bits << 1n) | (vals[i] >= avg ? 1n : 0n);
  }
  return hexPad64(bits);
}

// dHash (difference hash). For 'x': 9x8 compares horizontally to 8x8 bits.
// For 'y': 8x9 compares vertically to 8x8 bits.
export async function computeDhash64(dataURL, mode = 'x', grayscale = true, cfg = { w: 9, h: 8 }, channel = null) {
  const img = await loadDataURL(dataURL);
  const w = cfg?.w ?? (mode === 'x' ? 9 : 8);
  const h = cfg?.h ?? (mode === 'x' ? 8 : 9);
  const c = toCanvas(img, w, h);
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, w, h);

  function px(x, y) {
    const idx = (y * w + x) * 4;
    return getChannelValue(data[idx], data[idx+1], data[idx+2], grayscale, channel);
  }

  let bits = 0n;
  if (mode === 'x') {
    // compare horizontally: (w-1) * h = 8*8 = 64
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const v = px(x, y) < px(x + 1, y) ? 1n : 0n;
        bits = (bits << 1n) | v;
      }
    }
  } else {
    // mode 'y' — compare vertically: w * (h-1) = 8*8 = 64
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const v = px(x, y) < px(x, y + 1) ? 1n : 0n;
        bits = (bits << 1n) | v;
      }
    }
  }
  return hexPad64(bits);
}
