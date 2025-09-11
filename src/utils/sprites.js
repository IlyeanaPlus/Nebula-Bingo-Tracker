// src/utils/sprites.js
// Robust sprite index loader (supports rows format and legacy vectors/meta).
// Prefers local /sprites/*.png URLs; falls back to any drive_cache if needed.

const BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, ""); // "" or "/Nebula-Bingo-Tracker"
const CANDIDATES = [
  `${BASE}/sprite_index_clip.json`,
  `${BASE}/sprites/sprite_index_clip.json`,
  `${BASE}/assets/sprite_index_clip.json`,
];

let _indexPromise = null;

function b64ToFloat32(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const buf = new ArrayBuffer(len);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

async function fetchFirstOk(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      console.log("[sprites] loaded index:", url, "entries=", (j?.items?.length ?? j?.meta?.length ?? 0));
      return j;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No candidate index URL succeeded");
}

function normalizeIndex(json) {
  // New format:
  // { dim: 512, items: [{ key, name, drive_cache, sprite, vector_b64 }] }
  if (Array.isArray(json?.items)) {
    const dim = Number(json?.dim) || 512;
    const items = json.items;
    const vectors = new Array(items.length);
    const meta = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const v = it.vector_b64 ? b64ToFloat32(it.vector_b64) : new Float32Array(dim);
      // prefer local sprite path if present; otherwise fall back to drive_cache
      const localSprite = it.sprite ? `${BASE}/sprites/${it.sprite}` : "";
      const url = localSprite || it.drive_cache || "";
      vectors[i] = v;
      meta[i] = { key: it.key || String(i), name: it.name || it.key || String(i), url };
    }
    return { dim, count: items.length, vectors, meta, normalized: true };
  }

  // Legacy format:
  // { vectors: ["base64...", ...], meta: [{key,name,url}], (optional) dim }
  if (Array.isArray(json?.vectors) && Array.isArray(json?.meta)) {
    const vectors = json.vectors.map(b64ToFloat32);
    const dim = vectors[0]?.length || Number(json?.dim) || 512;
    // Prefer local sprite if meta has 'sprite' or name→filename pattern
    const meta = json.meta.map((m, i) => {
      const spr =
        m.sprite ? `${BASE}/sprites/${m.sprite}` :
        (m.key ? `${BASE}/sprites/${m.key}.png` : "");
      const url = spr || m.url || m.drive_cache || "";
      return { key: m.key || String(i), name: m.name || m.key || String(i), url };
    });
    return { dim, count: vectors.length, vectors, meta, normalized: true };
  }

  throw new Error("Unrecognized sprite index format");
}

export async function getSpriteIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = (async () => {
    try {
      const json = await fetchFirstOk(CANDIDATES);
      const idx = normalizeIndex(json);
      if (!idx.count || !idx.dim) {
        console.warn("[sprites] Empty/invalid index shape:", idx);
      }
      return idx;
    } catch (err) {
      console.warn("[sprites] failed to load index:", err);
      throw new Error(`Failed to load sprite index: ${err.message}`);
    }
  })();
  return _indexPromise;
}
