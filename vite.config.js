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
    // We’re now ALLOWING ORT’s JSEP loader + sibling .wasm to be bundled under /assets/.
    sourcemap: true,               // helpful if we need to trace initiators
    chunkSizeWarningLimit: 1200,   // quiet down warnings for ORT-sized chunks
  },
  // No aliasing of "onnxruntime-web" and no forbid-JSEP plugin in bundled mode.
  resolve: {
    alias: {
      // (optional) if you want to FORCE all imports to go through your env wrapper anyway:
      // "onnxruntime-web": "/src/utils/ortEnv.js",
    },
  },
  optimizeDeps: {
    // defaults are fine; we’re not excluding the JSEP loader anymore
  },
});
