// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/** GH Pages safe defaults */
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

/**
 * IMPORTANT: Use string base path, not an object map.
 * This makes ORT resolve ALL runtime files (JSEP + sibling .wasm)
 * relative to /public/ort-wasm/ at runtime — no bundler involvement.
 */
const base = resolvePublic("ort-wasm/");
ort.env.wasm.wasmPaths = base; // <— single directory string

// (optional) tiny debug surface
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
