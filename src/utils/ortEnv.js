// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/** GH Pages–safe ORT setup */
ort.env.wasm.numThreads = 1;   // single-thread (no COOP/COEP needed)
ort.env.wasm.proxy = false;    // no worker proxy
ort.env.wasm.simd = false;     // safe baseline
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");

// Make the .wasm the primary target, and also map the JSEP loader.
// Do NOT include any fetch/XHR rewrite shims here.
ort.env.wasm.wasmPaths = {
  // the sibling wasm the loader expects
  "ort-wasm-simd-threaded.jsep.wasm": base + "ort-wasm-simd-threaded.jsep.wasm",

  // the JS loader module (fetched & executed as JS, NOT as wasm)
  "ort-wasm-simd-threaded.jsep.mjs":  base + "ort-wasm-simd-threaded.jsep.mjs",

  // extra aliases some ORT builds may resolve; point them to the same wasm
  "ort-wasm-simd-threaded.wasm":      base + "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd.wasm":               base + "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm.wasm":                    base + "ort-wasm-simd-threaded.jsep.wasm",
};

// Tiny debug surface
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
