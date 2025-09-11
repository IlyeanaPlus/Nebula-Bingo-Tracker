// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * When deploying to GitHub Pages, serve from /<repo>/.
 * CI already sets GHPAGES=1 in your workflow.
 */
const REPO = "Nebula-Bingo-Tracker";
const isPages = process.env.GHPAGES === "1";

export default defineConfig({
  base: isPages ? `/${REPO}/` : "/",
  plugins: [react()],
  build: {
    // Allow ORT’s JSEP loader + sibling .wasm to be bundled under /assets/.
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: {
      // (optional): force all imports through your env wrapper
      // "onnxruntime-web": "/src/utils/ortEnv.js",
    },
  },
  optimizeDeps: {
    // defaults are fine
  },
});
