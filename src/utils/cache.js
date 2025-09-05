const CACHE_KEY = "refHashCacheV1";

export function bitsToString(bits) { return bits.join(""); }
export function stringToBits(s) { return s.split("").map((ch) => (ch === "1" ? 1 : 0)); }
export function loadCacheLS() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
export function saveCacheLS(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {} }
