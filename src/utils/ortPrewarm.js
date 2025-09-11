// src/utils/ortPrewarm.js
async function prewarmOrtRuntime() {
  if (typeof window === "undefined" || window.__ORT_PREWARMED__) return;
  window.__ORT_PREWARMED__ = true;

  const wasm = window.__ORT_WASM_EMITTED__?.wasm || "";
  if (!wasm) return;

  try {
    const r = await fetch(wasm, { method: "HEAD", cache: "no-store" });
    console.log("[ORT prewarm]", wasm, "→", r.status, r.headers.get("content-type"));
  } catch (err) {
    console.warn("[ORT prewarm] wasm HEAD failed:", err);
  }
}

export { prewarmOrtRuntime };   // named export
export default prewarmOrtRuntime; // default export
