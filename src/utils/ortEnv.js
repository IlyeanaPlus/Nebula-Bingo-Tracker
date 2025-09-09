// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");

// Map all names the loader/ORT might ask for → our public files
ort.env.wasm.wasmPaths = {
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm": base + "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.wasm":      base + "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd.wasm":                base + "ort-wasm-simd-threaded.jsep.wasm",
};

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
