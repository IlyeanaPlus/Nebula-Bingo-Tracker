import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

// Lock down for GH Pages
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");

// ORT may request both the JSEP loader *and* the underlying wasm.
// Map them both to your vendored loader file.
ort.env.wasm.wasmPaths = {
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm": base + "ort-wasm-simd-threaded.jsep.mjs"
};

console.log("[ORT env init]", {
  wasmPaths: ort.env.wasm.wasmPaths,
  simd: ort.env.wasm.simd,
  threads: ort.env.wasm.numThreads,
  proxy: ort.env.wasm.proxy,
});

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
