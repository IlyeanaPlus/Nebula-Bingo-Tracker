// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";

/**
 * Known-good bundled-mode baseline (from your working snapshot):
 * - Let ORT/JSEP resolve its own loader + wasm relative to the bundle (no wasmPaths).
 * - Keep conservative runtime to avoid COOP/COEP friction.
 */
ort.env.debug = false;

// Strict, GH Pages–safe defaults
ort.env.wasm.numThreads = 1;   // single-thread
ort.env.wasm.proxy = false;    // no worker proxy
ort.env.wasm.simd = false;     // baseline (flip to true later if desired)

// IMPORTANT: do NOT set ort.env.wasm.wasmPaths here in bundled mode.

// Tiny debug surface (unchanged from your repo)
window.__ORTDBG__ = {
  wasmPaths: ort.env.wasm.wasmPaths, // should be undefined in bundled mode
  settings: {
    simd: ort.env.wasm.simd,
    threads: ort.env.wasm.numThreads,
    proxy: ort.env.wasm.proxy,
  },
};
console.log("[ORT env init — bundled mode]", window.__ORTDBG__);

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
