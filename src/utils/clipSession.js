// src/utils/clipSession.js
// Dev-safe CLIP loader with robust ORT wasm base detection (byte-first, URL fallback).

import ort from "../utils/ortEnv";

let _sessionPromise = null;

/* ------------------------ BASE & candidates ------------------------ */

// In dev, ignore the GitHub Pages base to avoid fetching index.html instead of the model.
// In build (Pages), respect the configured base.
const rawBase = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "");
const BASE = import.meta?.env?.DEV ? "" : rawBase;

const MODEL_NAMES = ["vision_model_int8_qlinear.onnx", "vision_model.onnx"];

function buildCandidateUrls() {
  const urls = [];
  for (const name of MODEL_NAMES) {
    urls.push(`${BASE}/models/${name}`); // primary
    urls.push(`/models/${name}`);        // plain-root fallback
  }
  return Array.from(new Set(urls));
}

/* ------------------------ ORT wasm base (probe + prewarm) ------------------------ */

async function headOk(url) {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.ok ? (r.headers.get("content-type") || "") : "";
  } catch {
    return "";
  }
}

async function ensureWasmBase() {
  // If something already emitted the base, use it.
  const emitted =
    (typeof window !== "undefined" && (window.__ORT_WASM_EMITTED__ ||
      (window.__ORT_WASM_MJS__ && window.__ORT_WASM_WASM__ && {
        mjs: window.__ORT_WASM_MJS__, wasm: window.__ORT_WASM_WASM__,
      }))) || null;

  if (emitted?.mjs) {
    const base = emitted.mjs.slice(0, emitted.mjs.lastIndexOf("/") + 1);
    if (!ort.env?.wasm?.wasmPaths) ort.env.wasm.wasmPaths = base;
    if (import.meta.env.DEV) console.log("[clipSession] using emitted wasm base:", ort.env.wasm.wasmPaths);
    return;
  }

  // DEV fallback: probe our vendored copy under /src/vendor/ort/
  if (import.meta.env.DEV) {
    const vendBase = "/src/vendor/ort/";
    const vendWasm = vendBase + "ort-wasm-simd-threaded.jsep.wasm";
    const ctVend = await headOk(vendWasm);
    if (/application\/wasm/i.test(ctVend)) {
      ort.env.wasm.wasmPaths = vendBase;
      if (import.meta.env.DEV) console.log("[clipSession] wasm base →", vendBase, ctVend);
      // Nudge Vite to prep the JSEP module too (not strictly required)
      try { await import(/* @vite-ignore */ vendBase + "ort-wasm-simd-threaded.jsep.mjs?import"); } catch {}
      return;
    }
  }

  // Build/Pages fallback: probe /assets/ (bundled mode)
  const assetsBase = `${rawBase || ""}/assets/`.replace(/\/{2,}/g, "/");
  const assetsWasm = assetsBase + "ort-wasm-simd-threaded.jsep.wasm";
  const ctAssets = await headOk(assetsWasm);
  if (/application\/wasm/i.test(ctAssets)) {
    ort.env.wasm.wasmPaths = assetsBase;
    if (import.meta.env.DEV) console.log("[clipSession] wasm base →", assetsBase, ctAssets);
    return;
  }

  // Last resort: leave as-is; ORT may still resolve relative to its module if available.
  if (import.meta.env.DEV) console.warn("[clipSession] Could not verify ORT wasm base; proceeding with defaults.");
}

/* ------------------------ fetch + session creation ------------------------ */

async function fetchBytes(url) {
  console.log("[clipSession] fetching model bytes:", url);
  const r = await fetch(url, { cache: "no-store" });
  const ab = await r.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const ct = r.headers.get("content-type") || "";
  const looksText =
    /text\/html|text\/javascript|application\/javascript/i.test(ct) ||
    bytes.byteLength < 4096; // too small to be a real ONNX
  console.log("[clipSession] model bytes fetched:", bytes.byteLength, "bytes", ct || "");
  if (!r.ok || looksText) {
    throw new Error(`Bad model fetch (${r.status}) ${ct} ${bytes.byteLength}B`);
  }
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

/* ------------------------ public: getClipSession ------------------------ */

export async function getClipSession() {
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    await ensureWasmBase();

    if (import.meta.env.DEV) {
      console.log("[clipSession] ORT env", {
        wasmPaths: ort.env?.wasm?.wasmPaths,
        simd: ort.env?.wasm?.simd,
        threads: ort.env?.wasm?.numThreads,
        proxy: ort.env?.wasm?.proxy,
      });
    }

    let lastErr = null;
    const CANDIDATES = buildCandidateUrls();

    for (const url of CANDIDATES) {
      try { return await createFromBytes(url); }
      catch (e) { console.warn("[clipSession] byte session failed →", e?.message || e); lastErr = e; }
      try { return await createFromUrl(url); }
      catch (e) { console.warn("[clipSession] url session failed for", url, "→", e?.message || e); lastErr = e; }
    }
    throw lastErr || new Error("No model candidate succeeded");
  })();

  return _sessionPromise;
}

/* ------------------------ public: embedImage(canvas/img) ------------------------ */

export async function embedImage(canvasOrImage, session) {
  const size = 224;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");

  if (canvasOrImage) {
    const w = canvasOrImage.width || canvasOrImage.naturalWidth || size;
    const h = canvasOrImage.height || canvasOrImage.naturalHeight || size;
    ctx.drawImage(canvasOrImage, 0, 0, w, h, 0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  const { data } = ctx.getImageData(0, 0, size, size);
  const MEAN = [0.48145466, 0.4578275, 0.40821073];
  const STD  = [0.26862954, 0.26130258, 0.27577711];

  const plane = size * size;
  const x = new Float32Array(1 * 3 * plane);
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    x[0 * plane + i] = (r - MEAN[0]) / STD[0];
    x[1 * plane + i] = (g - MEAN[1]) / STD[1];
    x[2 * plane + i] = (b - MEAN[2]) / STD[2];
  }

  const inputName = (session.inputNames && session.inputNames[0]) || "pixel_values";
  const tensor = new ort.Tensor("float32", x, [1, 3, size, size]);
  const outputs = await session.run({ [inputName]: tensor });

  // Prefer an output whose last dim is 512; else first output.
  const outName =
    (session.outputNames || []).find((n) => {
      const o = outputs[n];
      return o?.dims && o.dims[o.dims.length - 1] === 512;
    }) ||
    (session.outputNames && session.outputNames[0]) ||
    Object.keys(outputs)[0];

  const out = outputs[outName];
  let vec =
    out?.data instanceof Float32Array
      ? out.data
      : new Float32Array(out?.data || []);

  // [1,512] / [1,1,512] / [1,seq,512] → first 512
  if (out?.dims?.length >= 2 && out.dims[out.dims.length - 1] === 512) {
    vec = vec.subarray(0, 512);
  }

  // L2 normalize
  let s = 0.0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0.0;
  for (let i = 0; i < vec.length; i++) vec[i] *= inv;

  return vec;
}
