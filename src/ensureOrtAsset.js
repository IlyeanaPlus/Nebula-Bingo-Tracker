// src/ensureOrtAsset.js
// Force Vite/Rollup to emit the JSEP wasm into /assets/ with a hashed filename.
import wasmUrl from "./vendor/ort/ort-wasm-simd-threaded.jsep.wasm?url";

// Optional: leave a breadcrumb so we can confirm at runtime which URL was emitted
if (typeof window !== "undefined") {
  window.__ORT_WASM_EMITTED__ = wasmUrl;
  // console.log("[ensureOrtAsset] emitted wasm:", wasmUrl);
}
