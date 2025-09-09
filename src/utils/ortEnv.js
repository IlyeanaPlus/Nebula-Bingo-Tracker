// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

// --- harden for GH Pages ---
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

const base = resolvePublic("ort-wasm/");
const PUBLIC_WASM = base + "ort-wasm-simd-threaded.jsep.wasm"; // if you ship the wasm
const PUBLIC_JSEP = base + "ort-wasm-simd-threaded.jsep.mjs";

// Map every variant ORT/JSEP might try
ort.env.wasm.wasmPaths = {
  "ort-wasm-simd-threaded.jsep.mjs": PUBLIC_JSEP,
  "ort-wasm-simd-threaded.jsep.wasm": PUBLIC_WASM,
  "ort-wasm-simd-threaded.wasm":      PUBLIC_WASM,
  "ort-wasm-simd.wasm":               PUBLIC_WASM,
};

// ---- RUNTIME SHIM (optional but helpful): redirect any stray .wasm fetch/XHR to our public copy ----
(() => {
  const dest = PUBLIC_WASM;
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    let url = typeof input === "string" ? input : (input?.url ?? "");
    if (typeof url === "string" && url.includes(".wasm")) input = dest;
    return origFetch.call(this, input, init);
  };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === "string" && url.includes(".wasm")) url = dest;
    return XO.call(this, method, url, ...rest);
  };
})();

// ---- Debug surface so you can inspect from DevTools Console ----
window.__ORTDBG__ = {
  ort,
  wasmPaths: ort.env.wasm.wasmPaths,
  settings: {
    simd: ort.env.wasm.simd,
    threads: ort.env.wasm.numThreads,
    proxy: ort.env.wasm.proxy,
  }
};

console.log("[ORT env init]", window.__ORTDBG__);

export const ORT_EXECUTION_PROVIDERS = ["wasm"];
export default ort;
