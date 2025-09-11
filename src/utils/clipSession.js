// src/utils/clipSession.js
import ort from "./ortEnv";

let _sessionPromise = null;

const BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "");
const MODELS = [
  `${BASE}/models/vision_model_int8_qlinear.onnx`,
  `${BASE}/models/vision_model.onnx`, // fallback if present
];

function ensureWasmBase() {
  const devBase = "/src/vendor/ort/";
  const prodBase = "/ort/";
  const want = import.meta.env.DEV ? devBase : prodBase;
  if (ort.env.wasm.wasmPaths !== want) {
    ort.env.wasm.wasmPaths = want;
  }
  console.log("[clipSession] wasm base →", ort.env.wasm.wasmPaths);
}

async function fetchBytes(url) {
  console.log("[clipSession] fetching model bytes:", url);
  const res = await fetch(url, { cache: "no-store" });
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  console.log("[clipSession] model bytes fetched:", bytes.byteLength, res.headers.get("content-type") || "<empty string>");
  if (!res.ok || bytes.byteLength < 1024) throw new Error(`Bad model fetch (${res.status}) ${res.headers.get("content-type") || ""} ${bytes.byteLength}B`);
  return bytes;
}

async function createFromBytes(url) {
  const bytes = await fetchBytes(url);
  console.log("[clipSession] creating session from bytes…");
  return await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
}

async function createFromUrl(url) {
  console.log("[clipSession] creating session from URL…");
  return await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
}

export async function getClipSession() {
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    ensureWasmBase();

    // Optional: log prewarmed wasm content-type
    const wasm = window.__ORT_WASM_EMITTED__?.wasm;
    if (wasm) {
      try {
        const head = await fetch(wasm, { method: "HEAD", cache: "no-store" });
        console.log("[clipSession] test wasm HEAD:", head.status, head.headers.get("content-type") || "<none>");
      } catch {}
    }

    let lastErr = null;
    for (const url of MODELS) {
      try {
        return await createFromBytes(url);
      } catch (e) {
        console.warn("[clipSession] byte session failed, falling back to URL:", e?.message || e);
        lastErr = e;
      }
      try {
        return await createFromUrl(url);
      } catch (e) {
        console.warn("[clipSession] url session failed for", url, e?.message || e);
        lastErr = e;
      }
    }
    throw lastErr || new Error("No model candidate succeeded");
  })();

  return _sessionPromise;
}


// ---- embedImage unchanged (kept here for completeness) ----
export async function embedImage(canvasOrImage, session) {
  const size = 224;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  if (canvasOrImage) {
    const w = canvasOrImage.width || canvasOrImage.naturalWidth || size;
    const h = canvasOrImage.height || canvasOrImage.naturalHeight || size;
    ctx.drawImage(canvasOrImage, 0, 0, w, h, 0, 0, size, size);
  }
  const { data } = ctx.getImageData(0, 0, size, size);
  const MEAN = [0.48145466, 0.4578275, 0.40821073];
  const STD  = [0.26862954, 0.26130258, 0.27577711];
  const plane = size * size;
  const x = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const r = data[i*4] / 255, g = data[i*4+1] / 255, b = data[i*4+2] / 255;
    x[0*plane+i] = (r - MEAN[0]) / STD[0];
    x[1*plane+i] = (g - MEAN[1]) / STD[1];
    x[2*plane+i] = (b - MEAN[2]) / STD[2];
  }
  const inputName = session.inputNames?.[0] || "pixel_values";
  const out = await session.run({ [inputName]: new ort.Tensor("float32", x, [1,3,size,size]) });
  const first = session.outputNames?.[0] || Object.keys(out)[0];
  let vec = out[first]?.data instanceof Float32Array ? out[first].data : new Float32Array(out[first]?.data || []);
  if (out[first]?.dims?.length === 3 && out[first].dims[2] === 512) vec = vec.subarray(0, 512);
  let s = 0; for (let i = 0; i < vec.length; i++) s += vec[i]*vec[i];
  const inv = s > 0 ? 1/Math.sqrt(s) : 0; for (let i = 0; i < vec.length; i++) vec[i] *= inv;
  return vec;
}
