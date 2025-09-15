// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";

const DEV = import.meta.env.DEV;
const WASM_BASE = DEV ? "/src/vendor/ort/" : "/ort/";

// Force a plain string base; ORT will append the right filenames.
ort.env.wasm.wasmPaths = WASM_BASE;

// Safe defaults; you can tune later.
ort.env.wasm.simd = true;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

console.log("[ORT env]", {
  wasmPaths: ort.env.wasm.wasmPaths,
  simd: ort.env.wasm.simd,
  threads: ort.env.wasm.numThreads,
  proxy: ort.env.wasm.proxy,
});

export default ort;
