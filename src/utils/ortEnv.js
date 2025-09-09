// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";

// Hard lock to plain WASM from our folder (no SIMD, no threads, no proxy)
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = false;
ort.env.wasm.proxy = false;
ort.env.debug = false;

// Only ever fetch from /ort-wasm/
ort.env.wasm.wasmPaths = new URL("/ort-wasm/", document.baseURI).href;

export const ORT_EXECUTION_PROVIDERS = ["wasm"];

// Optional one-line sanity log
console.log(
  `[ORT] wasmPaths=${ort.env.wasm.wasmPaths} simd=${ort.env.wasm.simd} threads=${ort.env.wasm.numThreads} proxy=${ort.env.wasm.proxy}`
);

export default ort;
