// src/utils/clip.js
// Image → Float32 NCHW tensor normalized for CLIP (ViT-B/32 defaults).
// Works in browser. Assumes an <img> or ImageBitmap-like input.

export async function imageToClipTensor(img, size = 224) {
  // Choose native dimensions safely
  const w = img.naturalWidth ?? img.width;
  const h = img.naturalHeight ?? img.height;
  if (!w || !h) {
    throw new Error("imageToClipTensor: input has no measurable dimensions");
  }

  // Center-crop square from the shortest side
  const s = Math.min(w, h);
  const sx = Math.floor((w - s) / 2);
  const sy = Math.floor((h - s) / 2);

  // First crop to a square
  const crop = document.createElement('canvas');
  crop.width = crop.height = s;
  const cctx = crop.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(img, sx, sy, s, s, 0, 0, s, s);

  // Resize to 224x224 (CLIP default) on a second canvas
  const can = document.createElement('canvas');
  can.width = can.height = size;
  const ctx = can.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(crop, 0, 0, size, size);

  const { data } = ctx.getImageData(0, 0, size, size); // Uint8 RGBA
  const out = new Float32Array(3 * size * size);

  // OpenAI CLIP normalization
  const mean = [0.48145466, 0.4578275, 0.40821073];
  const std  = [0.26862954, 0.26130258, 0.27577711];

  // Convert HWC Uint8 → CHW Float32 normalized
  const plane = size * size;
  for (let i = 0, p = 0; i < plane; i++) {
    const r = data[p++] / 255;
    const g = data[p++] / 255;
    const b = data[p++] / 255;
    p++; // skip alpha
    out[i]             = (r - mean[0]) / std[0];        // R plane
    out[i + plane]     = (g - mean[1]) / std[1];        // G plane
    out[i + 2*plane]   = (b - mean[2]) / std[2];        // B plane
  }

  return { data: out, shape: [1, 3, size, size] };
}

// Utility to turn a dataURL/blob into an <img> that has naturalWidth/Height
export function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}