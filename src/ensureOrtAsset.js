// Expose stable URLs (no ?url) for ORT’s JSEP loader + wasm in dev & prod.
// No dynamic imports; no HMR noise.

const MJS_HREF  = new URL("./vendor/ort/ort-wasm-simd-threaded.jsep.mjs",  import.meta.url).href;
const WASM_HREF = new URL("./vendor/ort/ort-wasm-simd-threaded.jsep.wasm", import.meta.url).href;

window.__ORT_JSEP_MJS_EMITTED__ = MJS_HREF;
window.__ORT_WASM_EMITTED__     = WASM_HREF;

console.log("[ensureOrtAsset] mjs:", MJS_HREF, "wasm:", WASM_HREF);
