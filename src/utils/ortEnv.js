// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/**
 * GH Pages–safe ORT env:
 *  - WASM backend only
 *  - single-thread, no proxy worker
 *  - SIMD disabled (safe baseline)
 *  - JSEP loader only (no .wasm URLs advertised)
 */

// Harden runtime
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.simd = false;
ort.env.debug = false;

// Map ONLY the JSEP loader we vendored in /public/ort-wasm/
const base = resolvePublic("ort-wasm/");
ort.env.wasm.wasmPaths = {
  "ort-wasm-simd-threaded.jsep.mjs": base + "ort-wasm-simd-threaded.jsep.mjs",
};

// Optional: last-resort guard. If some path still tries ".wasm",
// rewrite it to our JSEP loader. (Safe to leave in.)
// NOTE: If you *also* ship the .wasm, change DEST to base + "ort-wasm-simd-threaded.jsep.wasm".
(() => {
  const DEST = base + "ort-wasm-simd-threaded.jsep.mjs";
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (typeof url === "string" && url.includes(".wasm")) input = DEST;
    return origFetch.call(this, input, init);
  };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === "string" && url.includes(".wasm")) url = DEST;
    return XO.call(this, method, url, ...rest);
  };
})();

// Tiny debug surface for DevTools
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
