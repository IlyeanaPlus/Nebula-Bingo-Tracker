// src/utils/ortEnv.js
import * as ort from "onnxruntime-web";
import { resolvePublic } from "./publicPath";

/** GH Pages–safe ORT setup */
ort.env.wasm.numThreads = 1;   // single-thread (no COOP/COEP reqs)
ort.env.wasm.proxy = false;    // no worker proxy
ort.env.wasm.simd = false;     // safe baseline
ort.env.debug = false;

/**
 * IMPORTANT: Use a directory string for wasmPaths.
 * ORT will load the JSEP loader + sibling .wasm from /public/ort-wasm/
 * without bundler involvement.
 */
const base = resolvePublic("ort-wasm/");
ort.env.wasm.wasmPaths = base;

// Public WASM path (used by the runtime redirect shim below)
const PUBLIC_WASM = base + "ort-wasm-simd-threaded.jsep.wasm";

/** Runtime safety net:
 * If any code still tries to fetch a hashed /assets/*.wasm name,
 * rewrite it to our public sibling WASM so the request succeeds.
 */
(() => {
  const pat = /ort-wasm-simd-threaded\.jsep.*\.wasm/i;

  const redirect = (url) => (pat.test(url) ? PUBLIC_WASM : url);

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string") return origFetch.call(this, redirect(input), init);
    if (input && input.url) {
      const req = new Request(redirect(input.url), input);
      return origFetch.call(this, req, init);
    }
    return origFetch.apply(this, arguments);
  };

  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === "string") url = redirect(url);
    return XO.call(this, method, url, ...rest);
  };
})();

// Tiny debug surface
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
