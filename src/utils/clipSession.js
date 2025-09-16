// src/utils/clipSession.js
// Robust CLIP session + embedding that auto-detects the correct input name
// (e.g. "pixel_values", "input", "images", etc.) and returns a 512-d L2 vector.

let _sessPromise;
let _sess;
let _inputName; // resolved once per session

async function _createSession() {
  if (_sess) return _sess;
  if (_sessPromise) return _sessPromise;

  _sessPromise = (async () => {
    const ort = await import("onnxruntime-web"); // ESM
    const modelUrl = "/models/vision_model_int8_qlinear.onnx";
    const opts = { executionProviders: ["wasm"] };

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(modelUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`Model HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      _sess = await ort.InferenceSession.create(buf, opts);

      // Resolve input name once
      _inputName = resolveInputName(_sess);
      return _sess;
    } finally {
      clearTimeout(to);
    }
  })();

  return _sessPromise;
}

function resolveInputName(session) {
  // Prefer explicit metadata if available
  const meta = session.inputNames || Object.keys(session.inputMetadata || {});
  const names = Array.isArray(meta) ? meta : [];

  // Try common CLIP names first
  const preferred = ["pixel_values", "input", "images", "input_tensor", "x"];
  for (const want of preferred) {
    if (names.includes(want)) return want;
  }
  // Fall back to the first declared input
  if (names.length) return names[0];

  // Absolute fallback
  return "pixel_values";
}

function _to224(canvas) {
  const out = document.createElement("canvas");
  out.width = 224; out.height = 224;
  const g = out.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, 224, 224);
  return out;
}

function _toCHWFloat32(img224) {
  const g = img224.getContext("2d", { willReadFrequently: true });
  const { data } = g.getImageData(0, 0, 224, 224);
  // openai/clip preproc
  const mean = [0.48145466, 0.4578275, 0.40821073];
  const std  = [0.26862954, 0.26130258, 0.27577711];

  const chw = new Float32Array(3 * 224 * 224);
  let p = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g1 = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    chw[p]                 = (r - mean[0]) / std[0];         // R
    chw[p + 224 * 224]     = (g1 - mean[1]) / std[1];        // G
    chw[p + 2 * 224 * 224] = (b - mean[2]) / std[2];         // B
    p++;
  }
  return chw;
}

function _l2(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= n;
  return vec;
}

export async function getClipSession() {
  return _createSession();
}

/**
 * Embed an image canvas -> Float32Array(512) L2
 * @param {HTMLCanvasElement} canvas
 * @param {any} session optional precreated session
 */
export async function embedImage(canvas, session) {
  const ort = await import("onnxruntime-web");
  const s = session || (await getClipSession());

  // Ensure we have the resolved name
  const inputName = _inputName || resolveInputName(s);

  // Resize + to CHW
  const img224 = _to224(canvas);
  const chw = _toCHWFloat32(img224);

  const tensor = new ort.Tensor("float32", chw, [1, 3, 224, 224]);
  const feeds = { [inputName]: tensor }; // 👈 correct name (e.g., "pixel_values")

  const out = await s.run(feeds);
  // Use first output tensor by default
  const firstKey = s.outputNames?.[0] || Object.keys(out)[0];
  const first = out[firstKey];
  const vec = new Float32Array(first.data);
  return _l2(vec);
}

export default { getClipSession, embedImage };
