// src/main.jsx
import "./ensureOrtAsset";  // First
import "./utils/ortEnv"; // Second
import { prewarmOrtRuntime } from "./utils/ortPrewarm";
if (import.meta.env.DEV) prewarmOrtRuntime();
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/bingo.css";

// Unregister any old SW & clear caches to avoid stale assets
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k)));
}

createRoot(document.getElementById("root")).render(<App />);
