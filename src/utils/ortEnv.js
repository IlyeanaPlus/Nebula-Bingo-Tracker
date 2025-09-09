// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/**
 * ORT-Web config for GitHub Pages
 * - WASM backend only
 * - Single-thread, no proxy worker, SIMD disabled
 * - Load runtime from /public/ort-wasm/ (JSEP + its sibling .wasm)
 */

ort.env.wasm.numThreads = 1;   // GH Pages: no COOP/COEP, so keep single-thread
ort.env.wasm.proxy = false;    // no worker proxy
ort.env.wasm.simd = false;     // safe baseline (JSEP still works if SIMD is available)
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");

// We host both runtime artifacts ourselves. Map every name ORT/JSEP may ask for.
ort.env.wasm.wasmPaths = {
  // Primary JSEP loader (JS module that boots wasm)
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",

  // Sibling wasm that the loader expects
  "ort-wasm-simd-threaded.jsep.wasm": base + "ort-wasm-simd-threaded.jsep.wasm",

  // Extra aliases some builds may request; point them to the same wasm
  "ort-wasm-simd-threaded.wasm":      base + "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd.wasm":               base + "ort-wasm-simd-threaded.jsep.wasm",
};

// Optional: tiny debug surface so you can confirm at runtime from DevTools
window.__ORTDBG__ = {
  wasmPaths: ort.env.wasm.wasmPaths,
  settings: {
    simd: ort.env.wasm.simd,
    threads: ort.env.wasm.numThreads,
    proxy: ort.env.wasm.proxy,
  },
};
console.log("[ORT env init]", window.__ORTDBG__);

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
