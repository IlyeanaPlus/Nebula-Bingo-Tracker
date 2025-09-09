// src/utils/clipSession.js
import "../utils/ortEnv";
import * as ort from "onnxruntime-web";
import { imageToClipTensor } from "./clip";

let _session = null;
let _modelUrl = "models/vision_model_int8.onnx"; // local by default
let _modelBytes = null;

export function setClipModelUrl(url) {
  _modelUrl = url;
  _session = null;
  _modelBytes = null;
}

// Optional: make ORT WASM loading robust on GH Pages
// Use one (local OR CDN). Local: copy *.wasm files under /public/ort-wasm/ and point to it.
/*
ort.env.wasm.wasmPaths = "/ort-wasm/"; // if you host wasm locally
*/
// Or CDN fallback (simple & reliable):
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";

// Avoid COEP/COOP issues: single-threaded WASM is safest on GH Pages
ort.env.wasm.numThreads = 1;
// (Leave SIMD auto; ORT handles it when available)

async function preloadClipModel() {
  if (_modelBytes) return _modelBytes;
  console.log("[clipSession] fetching model bytes:", _modelUrl);
  const res = await fetch(_modelUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`[clipSession] model fetch failed: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  _modelBytes = new Uint8Array(buf);
  console.log("[clipSession] model bytes fetched:", _modelBytes.byteLength, "bytes");
  return _modelBytes;
}

export async function getClipSession(opts = {}) {
  if (_session) return _session;
  const defaultOpts = {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  };
  try {
    const bytes = await preloadClipModel();
    console.log("[clipSession] creating session from bytes…");
    _session = await ort.InferenceSession.create(bytes, { ...defaultOpts, ...opts });
    console.log("[clipSession] session ready.", _session.inputNames, _session.outputNames);
    return _session;
  } catch (e) {
    console.warn("[clipSession] byte session failed, falling back to URL:", e);
    _session = await ort.InferenceSession.create(_modelUrl, { ...defaultOpts, ...opts });
    console.log("[clipSession] session ready (URL).", _session.inputNames, _session.outputNames);
    return _session;
  }
}

export async function embedImage(img, session) {
  const s = session || (await getClipSession());
  const tensor = await imageToClipTensor(img);
  const feeds = {};
  const inputName = (s.inputNames && s.inputNames[0]) || "pixel_values";
  feeds[inputName] = new ort.Tensor("float32", tensor.data, tensor.shape);
  const t0 = performance.now();
  const results = await s.run(feeds);
  const dt = Math.round(performance.now() - t0);
  const outName = (s.outputNames && s.outputNames[0]) || Object.keys(results)[0];
  console.log("[clipSession] run OK in", dt, "ms →", outName, "len=", results[outName]?.data?.length);
  return results[outName];
}

export function l2norm(vec) {
  let sum = 0.0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1.0 / Math.sqrt(sum) : 0;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}
