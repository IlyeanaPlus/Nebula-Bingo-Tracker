// src/tuning/tuningStore.js
const KEY = "nbt.tuning.v1";

const defaults = {
  // cosine threshold for a match
  scoreThreshold: 0.28,   // 0..1

  // background “unboarding” epsilon (0 = off)
  // recommended discrete values: 0, 0.02, 0.06
  unboardEps: 0.00,

  // +/- pixel drift allowance applied by your cropper (if supported)
  cropJitter: 0,          // in pixels, 0..4

  // new (index control):
  embedDim: 512,
  indexSlice: [0, 512],          // pick the 512-wide window inside vectors
  // indexKeyCandidates: []      // not used when vectors[] is present
};

let data = defaults;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = { ...defaults, ...JSON.parse(raw) };
} catch {}

const subs = new Set();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  subs.forEach(cb => cb(data));
}

export const tuning = {
  get() { return data; },
  set(partial) { data = { ...data, ...partial }; save(); },
  reset() { data = { ...defaults }; save(); },
  subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
  defaults,
};
