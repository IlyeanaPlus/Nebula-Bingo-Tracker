// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Use repo subpath on GitHub Pages; dev server ignores base
  base: process.env.GHPAGES ? "/Nebula-Bingo-Tracker/" : "/",
  optimizeDeps: {
    exclude: ["onnxruntime-web"], // ensure ortEnv runs before ORT
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
