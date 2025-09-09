import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");

ort.env.wasm.wasmPaths = {
  // Direct JSEP loader
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",

  // The loader's internal .wasm fallbacks — point them back to the same .mjs file
  "ort-wasm-simd-threaded.jsep.wasm": base + "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.wasm": base + "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd.wasm": base + "ort-wasm-simd-threaded.jsep.mjs"
};

console.log("[ORT env init]", ort.env.wasm.wasmPaths);

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
