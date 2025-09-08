// src/utils/clipSession.js
// Thin wrapper around onnxruntime-web to run the CLIP image encoder.
import * as ort from 'onnxruntime-web';
import { imageToClipTensor } from './clip';

let _session = null;

/**
 * Get or create a singleton session
 * Default model URL now points to Hugging Face (as provided).
 */
export async function getClipSession(
  modelUrl = 'https://huggingface.co/Ilyeana/Nebula-ONNX/resolve/main/clip-vit-b32.onnx',
  opts = {}
) {
  if (_session) return _session;
  const defaultOpts = {
    executionProviders: ['wasm'], // switch to ['webgpu'] if you enabled it
    graphOptimizationLevel: 'all',
  };
  _session = await ort.InferenceSession.create(modelUrl, { ...defaultOpts, ...opts });
  return _session;
}

export async function embedImage(img, session) {
  const s = session || await getClipSession();
  const tensor = await imageToClipTensor(img);
  const feeds = {};
  const inputName = (s.inputNames && s.inputNames[0]) || 'pixel_values';
  feeds[inputName] = new ort.Tensor('float32', tensor.data, tensor.shape);
  const results = await s.run(feeds);
  const outName = (s.outputNames && s.outputNames[0]) || Object.keys(results)[0];
  return results[outName]; // Tensor { data: Float32Array, dims: [...] }
}

/** Normalize vector to unit length (for cosine) */
export function l2norm(vec) {
  let sum = 0.0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1.0 / Math.sqrt(sum) : 0;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}