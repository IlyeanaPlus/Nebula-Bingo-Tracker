// src/main.jsx
import ensureOrtAsset from "./ensureOrtAsset";
import prewarmOrtRuntime from "./utils/ortPrewarm";
import "./utils/ortEnv";
import { loadSpriteIndex } from "./utils/sprites";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/bingo.css";

// ---------------- DEV: disable persistence for cards ----------------
if (import.meta.env.DEV) {
  const KS = [/^nbt\.cards(\.|$)/i]; // nbt.cards.*, nbt.cards.v2, etc.
  const hit = (k) => KS.some((rx) => rx.test(String(k)));
  const LS = window.localStorage;
  if (LS && !LS.__nbt_wrapped) {
    const _get = LS.getItem.bind(LS);
    const _set = LS.setItem.bind(LS);
    const _rem = LS.removeItem.bind(LS);
    LS.getItem = (k) => (hit(k) ? null : _get(k));
    LS.setItem = (k, v) => (hit(k) ? undefined : _set(k, v));
    LS.removeItem = (k) => (hit(k) ? undefined : _rem(k));
    LS.__nbt_wrapped = true;
    // one-time clear of old keys to avoid phantom UI state
    Object.keys(LS).forEach((k) => hit(k) && _rem(k));
    console.info("[NBT] Dev mode: card persistence disabled");
  }
}
// --------------------------------------------------------------------

// Preload assets (unchanged)
ensureOrtAsset();
prewarmOrtRuntime();
loadSpriteIndex().catch((err) => console.warn("Sprite index load failed:", err));

// mobile 100vh fix
function setVHVar() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
setVHVar();
window.addEventListener("resize", setVHVar);

// avoid iOS zoom
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("input, select, textarea, button").forEach((el) => {
    el.style.fontSize ||= "16px";
  });
});

// dev: unregister old SW + caches
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  caches?.keys?.().then((keys) => keys.forEach((k) => caches.delete(k)));
}

createRoot(document.getElementById("root")).render(<App />);
