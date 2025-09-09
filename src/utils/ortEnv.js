// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/**
 * Lock down ORT-Web for GitHub Pages:
 * - single-thread only
 * - no proxy worker
 * - no SIMD (safe fallback)
 * - map directly to our vendored JSEP loader
 */

// Hard disable features that break COOP/COEP on GH Pages
ort.env.wasm.numThreads = 1;   // force single-thread
ort.env.wasm.proxy = false;    // disable worker proxy
ort.env.wasm.simd = false;     // disable SIMD paths
ort.env.debug = false;

// Map to the JSEP loader you placed in public/ort-wasm/
const base = resolvePublic("ort-wasm/");
ort.env.wasm.wasmPaths = {
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",
};

// Quick console sanity log
console.log("[ORT env init]", {
  wasmPaths: ort.env.wasm.wasmPaths,
  simd: ort.env.wasm.simd,
  threads: ort.env.wasm.numThreads,
  proxy: ort.env.wasm.proxy,
});

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
