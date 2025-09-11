// src/main.jsx
import ensureOrtAsset from "./ensureOrtAsset";
import prewarmOrtRuntime from "./utils/ortPrewarm";
import "./utils/ortEnv"; // sets env + wasm base

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/bingo.css";

// Set base + announce URLs, then optionally warm the wasm.
ensureOrtAsset();
prewarmOrtRuntime();

// Kill old SW/caches in dev (helps with mime/type fallbacks)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k)));
}

createRoot(document.getElementById("root")).render(<App />);
