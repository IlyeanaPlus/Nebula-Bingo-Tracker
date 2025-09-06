// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App/>);

if ("serviceWorker" in navigator) {
  const BASE =
    (import.meta && import.meta.env && import.meta.env.BASE_URL) ||
    document.querySelector("base")?.getAttribute("href") ||
    "/Nebula-Bingo-Tracker/"; // fallback for GH Pages
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
  });
}
