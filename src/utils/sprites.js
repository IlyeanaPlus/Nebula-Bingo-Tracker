// src/utils/sprites.js
// Loads sprite_index_clip.json (rows+base64 preferred) and prepares:
//   - vecs:   Array<Float32Array(512)>
//   - shapes: Array<Float32Array(64) | null>
//   - refs:   [{ key, name, spriteUrl }]
// Works with GitHub Pages (BASE_URL aware).

const BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "");

// --- Decoders ---
function b64ToF32(b64) {
  const bin = atob(b64);
  const len = bin.length / 4;
  const buf = new ArrayBuffer(len * 4);
  const view = new DataView(buf);
  for (let i = 0; i < len; i++) {
    view.setUint8(i * 4 + 0, bin.charCodeAt(i * 4 + 0));
    view.setUint8(i * 4 + 1, bin.charCodeAt(i * 4 + 1));
    view.setUint8(i * 4 + 2, bin.charCodeAt(i * 4 + 2));
    view.setUint8(i * 4 + 3, bin.charCodeAt(i * 4 + 3));
  }
  return new Float32Array(buf);
}

function b64ToU8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeShape64(b64) {
  if (!b64) return null;
  const u = b64ToU8(b64);
  if (u.length < 64) return null;
  const f = new Float32Array(64);
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = u[i] / 255;
    f[i] = v;
    s += v * v;
  }
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < 64; i++) f[i] /= s;
  return f;
}

// --- Loader ---
let _indexPromise = null;

export async function getSpriteIndex() {
  if (_indexPromise) return _indexPromise;

  _indexPromise = (async () => {
    const url = `${BASE}/sprite_index_clip.json`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    const j = await r.json();

    // New format: { dim, items:[{ key,name,drive_cache,sprite,vector_b64,shape64_b64? }] }
    if (Array.isArray(j.items)) {
      const n = j.items.length;
      const dim = j.dim || 512;

      const vecs = new Array(n);
      const shapes = new Array(n);
      const refs = new Array(n);

      for (let i = 0; i < n; i++) {
        const it = j.items[i];
        vecs[i] = b64ToF32(it.vector_b64);
        shapes[i] = decodeShape64(it.shape64_b64);
        const spriteUrl = it.sprite
          ? `${BASE}/sprites/${encodeURIComponent(it.sprite)}`
          : (it.drive_cache || "");
        refs[i] = { key: it.key, name: it.name, spriteUrl };
      }

      console.log("[sprites] loaded index:", url, "entries=", n);
      return { dim, count: n, vecs, shapes, refs, normalized: true };
    }

    // Fallback: old format { dim?, vectors: base64[] or flat[], meta: [...] }
    // Try to decode best-effort.
    if (Array.isArray(j.vectors) && Array.isArray(j.meta)) {
      const n = j.meta.length;
      const dim = j.dim || 512;

      const vecs = new Array(n);
      const shapes = new Array(n).fill(null);
      const refs = new Array(n);

      // vectors might already be base64 per-row; support both
      for (let i = 0; i < n; i++) {
        const v = j.vectors[i];
        vecs[i] = typeof v === "string" ? b64ToF32(v) : new Float32Array(v);
        const m = j.meta[i] || {};
        const spriteUrl = m.sprite
          ? `${BASE}/sprites/${encodeURIComponent(m.sprite)}`
          : (m.url || m.drive_cache || "");
        refs[i] = { key: m.key || String(i), name: m.name || m.key || String(i), spriteUrl };
      }

      console.log("[sprites] loaded legacy index:", url, "entries=", n);
      return { dim, count: n, vecs, shapes, refs, normalized: true };
    }

    throw new Error("Unrecognized sprite index format.");
  })();

  return _indexPromise;
}
