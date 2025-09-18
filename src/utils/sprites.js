// src/utils/sprites.js
// Loader compatible with existing pipeline: exposes items[], vectors, and getVector(i).
// Also normalizes slug/name/url for your current index format.

let _index = null;

export async function loadSpriteIndex(jsonPath = "/sprite_index_clip.json") {
  if (_index) return _index;

  const res = await fetch(jsonPath, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${jsonPath}: ${res.status}`);
  const j = await res.json();

  const dim = Number(j.dim || 512);
  const count = Number(j.count || (j.items ? j.items.length : 0));
  const normalized = !!j.normalized;

  // Packed Float32 row-major (count * dim)
  const vectors = decodeVectorsB64(j.vectors_b64, count, dim);

  // Normalize items so downstream always has slug/name/url
  const items = (j.items || []).map((it, idx) => {
    const key = it.key ?? it.slug ?? it.name ?? String(idx);

    // Fix slug/name when index had "pokemon"
    let slug = (it.slug || "").toLowerCase();
    if (!slug || slug === "pokemon") slug = inferSlugFromKey(key);
    const name = it.name && it.name.toLowerCase() !== "pokemon"
      ? it.name
      : capitalize(slug);

    // URL: prefer explicit; else build from path/sprite; force under /sprites/
    const fallbackFile = (it.path || it.sprite || (key + ".png")).split("/").pop();
    let url = it.url || "";
    const isHttp = /^https?:\/\//i.test(url);
    const isSprites = /^\/sprites\//i.test(url);
    if (!url || (!isHttp && !isSprites)) {
      url = "/sprites/" + fallbackFile.replace(/^\/+/, "");
    }

    const path = it.path || (it.sprite ? `sprites/${it.sprite}` : `sprites/${fallbackFile}`);
    const shape64 = it.shape64_b64 ? b64ToUint8(it.shape64_b64) : null;

    return {
      idx: it.idx ?? idx,
      key,
      dex: it.dex ?? 0,
      slug,
      name,
      path,
      url,
      shape64,
    };
  });

  const byKey = new Map(items.map(x => [x.key, x]));

  // 🔑 Restore legacy API expected by matchers/useBingoCard:
  const getVector = (i) => {
    if (!Number.isFinite(i) || i < 0 || i >= items.length) {
      throw new Error(`getVector: index out of range (${i})`);
    }
    const start = i * dim;
    return vectors.subarray(start, start + dim);
  };

  _index = { dim, count: items.length, normalized, vectors, items, byKey, getVector };
  return _index;
}

export function getSpriteIndex() {
  if (!_index) throw new Error("Sprite index not loaded. Call loadSpriteIndex() first.");
  return _index;
}

// ---------- helpers ----------
function decodeVectorsB64(b64, count, dim) {
  if (!b64) return new Float32Array(0);
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const u8  = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const f32 = new Float32Array(buf);
  const expected = (count|0) * (dim|0);
  if (expected && f32.length !== expected) {
    console.warn(`[sprites] vector length mismatch: got ${f32.length}, expected ${expected}`);
  }
  return f32;
}

function b64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function inferSlugFromKey(key) {
  // Prefer token after numeric dex: pokemon_001_bulbasaur_... -> bulbasaur
  const parts = String(key).split("_");
  const di = parts.findIndex(p => /^\d+$/.test(p));
  if (di >= 0 && di + 1 < parts.length && /^[a-z]+$/i.test(parts[di + 1])) {
    return parts[di + 1].toLowerCase();
  }
  // Fallback: first alpha token that's not a tail marker
  const tail = new Set(["all","base","none","sprite","shiny","mega","gmax","alolan","galarian","hisuian","pokemon"]);
  for (const p of parts) {
    if (/^[a-z]+$/i.test(p) && !tail.has(p.toLowerCase())) return p.toLowerCase();
  }
  return "pokemon";
}

function capitalize(s) { return (s && s[0]) ? s[0].toUpperCase() + s.slice(1) : s; }
