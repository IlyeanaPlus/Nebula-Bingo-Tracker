// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * When deploying to GitHub Pages, serve from /<repo>/.
 * We set GHPAGES=1 in CI and in the local clean_build tool.
 */
const REPO = "Nebula-Bingo-Tracker";
const isPages = process.env.GHPAGES === "1";

// Hard block importing the ORT JSEP runtime from source.
// We only serve these from /public/ort-wasm/, never bundle them.
function forbidOrtJsepImport() {
  const pat = /ort-wasm-simd-threaded\.jsep\.(mjs|wasm)$/i;
  return {
    name: "forbid-ort-jsep-import",
    enforce: "pre",
    resolveId(id) {
      if (pat.test(id)) {
        throw new Error(
          "Do not import the ORT JSEP runtime from source. " +
            "It must be served from /public/ort-wasm/ (see src/utils/ortEnv.js)."
        );
      }
      return null;
    },
  };
}

export default defineConfig({
  base: isPages ? `/${REPO}/` : "/",
  plugins: [react(), forbidOrtJsepImport()],
  build: {
    // Never bundle the JSEP loader or its wasm, even if something tries.
    rollupOptions: {
      external: (id) =>
        /ort-wasm-simd-threaded\.jsep\.(mjs|wasm)$/i.test(id),
    },
    chunkSizeWarningLimit: 1200, // keep warnings quiet for ORT bundle size
  },
  optimizeDeps: {
    // Ensure the JSEP file is not prebundled during dev optimize step
    exclude: ["ort-wasm-simd-threaded.jsep.mjs"],
  },
});
