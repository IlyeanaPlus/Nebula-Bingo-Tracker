// src/utils/clipMatcher.js
// CLIP embedding matcher using onnxruntime-web.
// Model is loaded from a URL (env override supported) so we don't commit the .onnx file.

import "../utils/ortEnv";
import * as ort from "onnxruntime-web";

// -------------------------------
// Config: model + index locations
// -------------------------------

const MODEL_URL =
  import.meta.env.VITE_CLIP_MODEL_URL || "/models/vision_model_int8.onnx";

const INDEX_URL =
  import.meta.env.VITE_SPRITE_INDEX_URL || "sprite_index_clip.json"; // served from /public in your app

// -------------------------------
// Session (memoized)
// -------------------------------
let _sessionPromise = null;
export async function getSession() {
  if (_sessionPromise) return _sessionPromise;

  // Optional: mild perf tuning
  try {
    // allow threading hints; harmless if ignored
    ort.env.wasm.numThreads = Math.max(2, navigator?.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency / 2) : 2);
  } catch {}

  _sessionPromise = ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ["webgl", "wasm"], // webgl first, fallback to wasm
  });
  return _sessionPromise;
}

// -------------------------------
// Image helpers
// -------------------------------
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function centerCropTo(img, size = 224) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const dx = (size - w) / 2;
  const dy = (size - h) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, w, h);
  return ctx.getImageData(0, 0, size, size);
}

function chwFloat32(id, mean = [0.48145466, 0.4578275, 0.40821073], std = [0.26862954, 0.26130258, 0.27577711]) {
  const { width: W, height: H, data } = id;
  const out = new Float32Array(3 * H * W);
  const stride = H * W;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const j = (y * W + x) * 4;
      const r = data[j] / 255, g = data[j + 1] / 255, b = data[j + 2] / 255;
      out[0 * stride + i] = (r - mean[0]) / std[0];
      out[1 * stride + i] = (g - mean[1]) / std[1];
      out[2 * stride + i] = (b - mean[2]) / std[2];
    }
  }
  return out;
}

function l2normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

function cosineSim(a, b) {
  // assume L2-normalized → dot product is cosine
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// -------------------------------
// Embed a single image/crop URL
// -------------------------------
export async function embedImageURL(url) {
  const [img, session] = await Promise.all([loadImage(url), getSession()]);
  const id = centerCropTo(img, 224);
  const input = chwFloat32(id);
  const tensor = new ort.Tensor("float32", input, [1, 3, 224, 224]);

  const outputs = await session.run({ "input": tensor }); // input name for HF models is usually "input"
  // pick a reasonable output name; fall back to the first tensor
  const out =
    outputs["pooled_output"] ||
    outputs["last_hidden_state"] ||
    Object.values(outputs)[0];

  let vec;
  if (out.dims.length === 2) {
    // [1, 512]
    vec = out.data;
  } else if (out.dims.length === 3) {
    // [1, 577, 512] → CLS token at index 0
    const width = out.dims[2];
    vec = out.data.subarray(0, width);
  } else {
    throw new Error("Unexpected CLIP output shape: " + JSON.stringify(out.dims));
  }
  return l2normalize(new Float32Array(vec));
}

// -------------------------------
// Index (sprite vectors) loader
// -------------------------------
let _indexPromise = null;
export async function prepareEmbedIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = (async () => {
    const res = await fetch(INDEX_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`sprite index not found at ${INDEX_URL}`);
    const rows = await res.json(); // [{key,name,src,vec:[...]}]
    for (const r of rows) {
      r.vec = l2normalize(Float32Array.from(r.vec));
    }
    return {
      list: rows,
      byKey: new Map(rows.map(r => [r.key, r])),
      dim: rows[0]?.vec?.length || 512,
    };
  })();
  return _indexPromise;
}

// -------------------------------
// Search
// -------------------------------
export async function findBestMatchEmbed(cropUrl, embedIndex) {
  if (!cropUrl || !embedIndex?.list?.length) return null;
  const q = await embedImageURL(cropUrl); // 512-D L2-normalized

  let best = null, bestCos = -2;
  for (const r of embedIndex.list) {
    const c = cosineSim(q, r.vec);
    if (c > bestCos || (c === bestCos && String(r.key) < String(best?.key))) {
      bestCos = c; best = r;
    }
  }
  return best ? { key: best.key, name: best.name, src: best.src, score: bestCos } : null;
}

// -------------------------------
// Optional: tiny startup probe
// -------------------------------
export async function probeAvailability() {
  const [modelOk, indexOk] = await Promise.all([
    fetch(MODEL_URL, { method: "HEAD" }).then(r => r.ok).catch(() => false),
    fetch(INDEX_URL, { method: "HEAD" }).then(r => r.ok).catch(() => false),
  ]);
  return { modelOk, indexOk, MODEL_URL, INDEX_URL };
}
