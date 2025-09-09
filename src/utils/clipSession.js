// src/utils/clipSession.js
import "../utils/ortEnv"; // must be first
import ort, { ORT_EXECUTION_PROVIDERS } from "../utils/ortEnv";
import { resolvePublic } from "./publicPath";
import { imageToClipTensor } from "./clip";

let _session = null;
let _modelUrl = resolvePublic("models/vision_model_int8.onnx");
let _modelBytes = null;

export function setClipModelUrl(url) {
  _modelUrl = url;
  _session = null;
  _modelBytes = null;
}

async function preloadClipModel() {
  if (_modelBytes) return _modelBytes;
  console.log("[clipSession] fetching model bytes:", _modelUrl);
  const res = await fetch(_modelUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`[clipSession] model fetch failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  _modelBytes = new Uint8Array(buf);
  console.log("[clipSession] model bytes fetched:", _modelBytes.byteLength, "bytes");
  return _modelBytes;
}

export async function getClipSession(opts = {}) {
  if (_session) return _session;

  const defaultOpts = {
    executionProviders: ORT_EXECUTION_PROVIDERS,
    graphOptimizationLevel: "all",
  };

  try {
    const bytes = await preloadClipModel();
    console.log("[clipSession] creating session from bytes…");
    _session = await ort.InferenceSession.create(bytes, { ...defaultOpts, ...opts });
    console.log("[clipSession] session ready (bytes).", _session.inputNames, _session.outputNames);
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
  console.log(
    "[clipSession] run OK in",
    dt,
    "ms →",
    outName,
    "len=",
    results[outName]?.data?.length
  );

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
