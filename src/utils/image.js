// src/utils/image.js
// Helpers for turning an uploaded File/Blob/URL into an HTMLImageElement or Canvas.

export async function fileToImage(fileOrBlobOrUrl) {
  const url = await toObjectUrl(fileOrBlobOrUrl);
  try {
    const img = await loadImage(url);
    return img;
  } finally {
    // revoke after load to free memory (safe because image decodes to bitmap)
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

export async function fileToCanvas(fileOrBlobOrUrl) {
  const img = await fileToImage(fileOrBlobOrUrl);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  return c;
}

// ---------- internals ----------
async function toObjectUrl(x) {
  if (!x) throw new Error("No file/blob/url provided");
  if (typeof x === "string") return x;                  // already a URL/path
  if (x instanceof Blob) return URL.createObjectURL(x); // File or Blob
  if (x?.arrayBuffer) {                                  // generic File-like
    const buf = await x.arrayBuffer();
    return URL.createObjectURL(new Blob([buf]));
  }
  throw new Error("Unsupported input for fileToImage");
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // set crossOrigin so drawing to canvas won't taint if server allows it
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load failed for ${url}`));
    img.src = url;
  });
}
