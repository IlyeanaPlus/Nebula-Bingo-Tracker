import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function forbidJsepImport() {
  const banned = /ort-wasm-simd-threaded\.jsep\.mjs$/i;
  return {
    name: "forbid-jsep-import",
    resolveId(id, importer) {
      if (banned.test(id)) {
        throw new Error(
          `[build guard] Do NOT import the JSEP loader. Keep it in /public and let ORT load it via wasmPaths.\n` +
          `Importer: ${importer}\nTried to import: ${id}`
        );
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [react(), forbidJsepImport()],
  base: process.env.GHPAGES ? "/Nebula-Bingo-Tracker/" : "/",
  optimizeDeps: { exclude: ["onnxruntime-web"] }, // ensure ortEnv initializes first
  build: { chunkSizeWarningLimit: 1200 },
});
