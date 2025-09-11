import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const REPO = "Nebula-Bingo-Tracker";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? `/${REPO}/` : "/",  // dev always "/"
  plugins: [react()],
  build: { sourcemap: true, chunkSizeWarningLimit: 1200 },
}));
