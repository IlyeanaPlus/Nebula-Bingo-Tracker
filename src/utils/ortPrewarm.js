// src/utils/ortPrewarm.js
export async function prewarmOrtRuntime() {
  if (window.__ORT_PREWARMED__) return;
  window.__ORT_PREWARMED__ = true;

  const mjs  = window.__ORT_JSEP_MJS_EMITTED__ || "";
  const wasm = window.__ORT_WASM_EMITTED__ || "";
  console.log("[ORT prewarm] emitted:", { mjs, wasm });

  const urls = [mjs ? mjs + "?import" : null, wasm].filter(Boolean);
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      console.log("[ORT prewarm]", u, "→", r.status, r.headers.get("content-type"));
    } catch (err) {
      console.warn("[ORT prewarm] failed:", u, err);
    }
  }
}
