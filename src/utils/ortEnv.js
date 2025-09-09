// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath"; // add this helper if you haven't yet

// Strict: single, local wasm only
const wasmBase = resolvePublic("ort-wasm/");
ort.env.wasm.wasmPaths = {
  "ort-wasm.wasm": wasmBase + "ort-wasm.wasm"
};

ort.env.wasm.numThreads = 1;  // no threaded runtime
ort.env.wasm.simd = false;    // no simd
ort.env.wasm.proxy = false;   // no worker proxy
ort.env.debug = false;

console.log(
  `[ORT] wasmPaths=${JSON.stringify(ort.env.wasm.wasmPaths)} simd=${ort.env.wasm.simd} threads=${ort.env.wasm.numThreads} proxy=${ort.env.wasm.proxy}`
);

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
