// src/utils/onnx.js
import ort, { ORT_EXECUTION_PROVIDERS } from "./ortEnv";

// Resolve against the current <base> (works locally and on GH Pages)
export const MODEL_URL = new URL("models/vision_model_int8.onnx", document.baseURI).href;

export async function loadOnnxSession() {
  return await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ORT_EXECUTION_PROVIDERS,
    graphOptimizationLevel: "all", // safe with int8
  });
}
