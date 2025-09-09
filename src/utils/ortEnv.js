// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";

/**
 * Bundled-mode configuration:
 * - We let Vite/Rollup bundle ORT’s JSEP loader and its sibling .wasm into /assets/.
 * - We keep strict runtime parameters to avoid COOP/COEP headaches on GitHub Pages.
 */
ort.env.debug = false;

// Strict, GH Pages–safe defaults
ort.env.wasm.numThreads = 1;  // single-thread only
ort.env.wasm.proxy = false;   // no worker proxy
ort.env.wasm.simd = false;    // conservative; flip to true later if you want

// IMPORTANT: Do NOT set ort.env.wasm.wasmPaths in bundled mode.
// Leaving it undefined makes ORT resolve the loader + wasm relative to the bundled module (i.e., /assets/...).

// Tiny debug surface so you can verify at runtime
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
