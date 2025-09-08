// src/utils/sprites.js
// Prefer precomputed CLIP vectors from /sprite_index_clip.json (public).
// Fallbacks: /sprite_index.json → build from drive_cache.json (embedding each).

import { prepareRefIndex } from './matchers';

/** Resolve a public asset under the current base URL */
function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

/** Decode base64-encoded Float32 (little-endian) into Float32Array */
function decodeFloat32Base64(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const buf = new ArrayBuffer(len);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return new Float32Array(buf);
}

async function fetchJsonNoThrow(path) {
  const url = resolvePublic(path);
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Parse a precomputed index in one of the supported shapes:
 *  1) { vectors: number[][], meta: {url,name,key}[] }
 *  2) { vectors: string[], meta: [...] }           // base64 Float32
 *  3) [{ vector: number[]|string, url, name, key }, ...]
 */
function parsePrecomputed(data) {
  if (!data) return null;
  let vectors = [];
  let meta = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      let v;
      if (Array.isArray(item.vector)) v = new Float32Array(item.vector);
      else if (typeof item.vector === 'string') v = decodeFloat32Base64(item.vector);
      else continue;
      vectors.push(v);
      meta.push({ url: item.url, name: item.name ?? item.key ?? '', key: item.key ?? item.name ?? item.url });
    }
  } else if (data && data.vectors && data.meta) {
    for (let i = 0; i < data.vectors.length; i++) {
      const raw = data.vectors[i];
      let v;
      if (Array.isArray(raw)) v = new Float32Array(raw);
      else if (typeof raw === 'string') v = decodeFloat32Base64(raw);
      else continue;
      vectors.push(v);
      const m = data.meta[i] || {};
      meta.push({ url: m.url, name: m.name ?? m.key ?? '', key: m.key ?? m.name ?? m.url });
    }
  } else {
    return null;
  }

  if (vectors.length && meta.length === vectors.length) {
    return { vectors, meta };
  }
  return null;
}

/** Fallback: build from drive_cache.json (uses only src/name; ignores old hash fields) */
async function buildFromDriveCache() {
  const entries = await fetchJsonNoThrow('/drive_cache.json');
  if (!entries) throw new Error('getSprites: failed to fetch /drive_cache.json');
  // Normalize into array with absolute urls
  const refs = Array.isArray(entries)
    ? entries.map((value) => ({
        key: value?.name ?? value?.src ?? '',
        name: value?.name ?? '',
        url: (value?.src ?? '').startsWith('http') ? value.src : resolvePublic(value?.src ?? ''),
      }))
    : Object.entries(entries).map(([key, value]) => {
        const name = value?.name ?? key;
        const src  = value?.src  ?? value ?? key;
        const abs  = String(src).startsWith('http') ? src : resolvePublic(src);
        return { key, name, url: abs };
      });

  // Build CLIP embeddings on the fly
  return await prepareRefIndex(refs);
}

// Cache in-memory
let _spriteIndex = null;

/** Public: return the sprite index with vectors + meta */
export async function getSpriteIndex() {
  if (_spriteIndex) return _spriteIndex;

  // Prefer /sprite_index_clip.json
  const clipData = await fetchJsonNoThrow('/sprite_index_clip.json');
  const parsedClip = parsePrecomputed(clipData);
  if (parsedClip) {
    _spriteIndex = parsedClip;
    return _spriteIndex;
  }

  // Next, try /sprite_index.json
  const genericData = await fetchJsonNoThrow('/sprite_index.json');
  const parsedGeneric = parsePrecomputed(genericData);
  if (parsedGeneric) {
    _spriteIndex = parsedGeneric;
    return _spriteIndex;
  }

  // Fallback: build from drive_cache.json
  _spriteIndex = await buildFromDriveCache();
  return _spriteIndex;
}

/**
 * Compatibility wrapper for legacy code.
 * Returns just the refs (meta array) from the sprite index.
 */
export async function getSprites() {
  const index = await getSpriteIndex();
  return index.meta; // array of { url, name, key }
}