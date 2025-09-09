// src/utils/onnx.js
import ort, { ORT_EXECUTION_PROVIDERS } from "./ortEnv";

// ✅ no leading slash; respects GitHub Pages base path
export const MODEL_URL = new URL("models/vision_model_int8.onnx", document.baseURI).href;

export async function loadOnnxSession() {
  // Optional: quick HEAD check to surface 404s clearly in console
  try {
    const ok = await fetch(MODEL_URL, { method: "HEAD" });
    if (!ok.ok) console.error("[MODEL] 404/blocked:", MODEL_URL, ok.status, ok.statusText);
  } catch (e) {
    console.error("[MODEL] fetch HEAD failed:", MODEL_URL, e);
  }

  return await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ORT_EXECUTION_PROVIDERS,
    graphOptimizationLevel: "all",
  });
}
