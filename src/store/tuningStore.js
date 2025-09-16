// src/store/tuningStore.js
// Single source of truth for knobs (persisted to localStorage).

const STORAGE_KEY = "nbt.tuning.v1";

const DEFAULTS = {
  scoreThreshold: 0.62,   // 0.00–1.00
  cropInsetPct: 0.04,     // 0.00–0.10
  bgAtten: true,          // boolean
  bgSigma: 18,            // 6–32
  jitterFrac: 0,          // 0, 0.5, 1  (1→9 crops, 0.5→4, 0→1)
  debugTopK: 3            // 1–10
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const listeners = new Set();
let state = load();

export function getTuning() {
  return state;
}

export function setTuning(patch) {
  state = { ...state, ...patch };
  save(state);
  listeners.forEach((fn) => fn(state));
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const TuningKeys = {
  ScoreThreshold: "scoreThreshold",
  CropInsetPct: "cropInsetPct",
  BgAtten: "bgAtten",
  BgSigma: "bgSigma",
  JitterFrac: "jitterFrac",
  DebugTopK: "debugTopK",
};

export function clampTuning() {
  const s = getTuning();
  const c = {
    scoreThreshold: Math.max(0, Math.min(1, s.scoreThreshold)),
    cropInsetPct: Math.max(0, Math.min(0.1, s.cropInsetPct)),
    bgAtten: !!s.bgAtten,
    bgSigma: Math.max(6, Math.min(32, Math.round(s.bgSigma))),
    jitterFrac: [0, 0.5, 1].includes(s.jitterFrac) ? s.jitterFrac : 0,
    debugTopK: Math.max(1, Math.min(10, Math.round(s.debugTopK))),
  };
  setTuning(c);
  return c;
}

// ✅ Add a convenient facade for code that does: `import { tuning } from ".../tuningStore"`
export const tuning = {
  get: getTuning,
  set: setTuning,
  subscribe,
  clamp: clampTuning,
  keys: TuningKeys,
};

// (Optional) default export if you ever used `import tuning from "..."`
export default tuning;
