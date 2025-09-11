// src/ensureOrtAsset.js
import ort from "./utils/ortEnv";

export default function ensureOrtAsset() {
  const DEV = import.meta.env.DEV;
  const base = DEV ? "/src/vendor/ort/" : "/ort/";
  const variant = "simd-threaded";

  const mjs  = `${base}ort-wasm-${variant}.jsep.mjs`;
  const wasm = `${base}ort-wasm-${variant}.jsep.wasm`;

  // Record for logs / optional prewarm.
  window.__ORT_WASM_EMITTED__ = { mjs, wasm };

  // Ensure ORT sees the same base (string, not an object).
  ort.env.wasm.wasmPaths = base;

  console.log("[ensureOrtAsset] mjs:", mjs, "wasm:", wasm);
  return { mjs, wasm };
}
