
// src/utils/sprites.js
// Legacy-compatible sprite utilities, CLIP-powered under the hood.

import { prepareRefIndex } from './matchers';

function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

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

function parsePrecomputed(data) {
  if (!data) return null;
  let vectors = [], meta = [];
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
  } else return null;
  if (vectors.length && meta.length === vectors.length) return { vectors, meta };
  return null;
}

async function buildFromDriveCache() {
  const entries = await fetchJsonNoThrow('/drive_cache.json');
  if (!entries) throw new Error('getSprites: failed to fetch /drive_cache.json');
  const refs = Array.isArray(entries)
    ? entries.map((v) => ({ key: v?.name ?? v?.src ?? '', name: v?.name ?? '', url: (v?.src ?? '').startsWith('http') ? v.src : resolvePublic(v?.src ?? '') }))
    : Object.entries(entries).map(([key, v]) => {
        const name = v?.name ?? key;
        const src  = v?.src  ?? v ?? key;
        const abs  = String(src).startsWith('http') ? src : resolvePublic(src);
        return { key, name, url: abs };
      });
  return await prepareRefIndex(refs);
}

let _spriteIndex = null;
export async function getSpriteIndex() {
  if (_spriteIndex) return _spriteIndex;
  const clipData = await fetchJsonNoThrow('/sprite_index_clip.json');
  const parsedClip = parsePrecomputed(clipData);
  if (parsedClip) { _spriteIndex = parsedClip; return _spriteIndex; }
  const genericData = await fetchJsonNoThrow('/sprite_index.json');
  const parsedGeneric = parsePrecomputed(genericData);
  if (parsedGeneric) { _spriteIndex = parsedGeneric; return _spriteIndex; }
  _spriteIndex = await buildFromDriveCache();
  return _spriteIndex;
}
export async function getSprites() {
  const index = await getSpriteIndex();
  return index.meta;
}
export async function preloadSprites(max=100) {
  const meta = await getSprites();
  const subset = !isFinite(max) ? meta : meta.slice(0, Math.max(0,max));
  await Promise.allSettled(subset.map(m=> new Promise(res=>{
    try{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=img.onerror=()=>res(); img.src=m.url; }catch{res();}
  })));
  return subset;
}
