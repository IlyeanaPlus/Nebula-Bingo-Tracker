// src/utils/ortPrewarm.js
export async function prewarmOrtRuntime() {
  const dbg = window.__ORTDBG__;
  console.log("[ORT prewarm] config:", dbg);

  const base = (typeof dbg?.wasmPaths === "string")
    ? dbg.wasmPaths
    : ""; // if you used the object map version, you can skip base here

  // If you're on the "map" version of wasmPaths, fetch explicit filenames:
  const urls = [
    "/Nebula-Bingo-Tracker/ort-wasm/ort-wasm-simd-threaded.jsep.mjs",
    "/Nebula-Bingo-Tracker/ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
  ];

  const results = await Promise.allSettled(urls.map(u => fetch(u, { cache: "no-store" })));
  results.forEach((r, i) => {
    const u = urls[i];
    if (r.status === "fulfilled") console.log("[ORT prewarm]", u, "→", r.value.status);
    else console.warn("[ORT prewarm]", u, "→ failed", r.reason);
  });
}
