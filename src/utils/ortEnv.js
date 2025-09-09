// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

ort.env.wasm.numThreads = 1;  // single-threaded only
ort.env.wasm.simd = false;    // no SIMD
ort.env.wasm.proxy = false;   // no worker/proxy
ort.env.debug = false;

// Map ONLY the plain wasm file — no CDN fallbacks:
const wasmUrl = resolvePublic("ort-wasm/ort-wasm.wasm");
ort.env.wasm.wasmPaths = { "ort-wasm.wasm": wasmUrl };

/**
 * Preload the wasm binary and hand it to ORT.
 * This avoids both streaming issues and any filename guessing.
 */
export async function preloadOrtWasm() {
  const res = await fetch(wasmUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`[ORT] wasm fetch ${res.status} ${res.statusText} at ${wasmUrl}`);
  }
  ort.env.wasm.wasmBinary = await res.arrayBuffer();
  console.log("[ORT] wasm preloaded:", wasmUrl, "(bytes:", ort.env.wasm.wasmBinary.byteLength, ")");
}

export const ORT_EXECUTION_PROVIDERS = ["wasm"];

console.log("[ORT setup]", {
  wasmUrl,
  wasmPaths: ort.env.wasm.wasmPaths,
  simd: ort.env.wasm.simd,
  threads: ort.env.wasm.numThreads,
  proxy: ort.env.wasm.proxy,
});

export default ort;
