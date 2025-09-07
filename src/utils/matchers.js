// src/utils/matchers.js
//
// Matcher utilities for Nebula Bingo Tracker.
// Prefers local drive_cache.json for sprite sources + hashes.
// Normalizes manifest into refs with parsed BigInt hashes.
// Hashes crops with the same pipeline (unboard + resize + per-channel + edge).
// Matches via weighted Hamming distance.
//
// Exports:
//   prepareRefIndex(manifest)
//   findBestMatch(cropUrl, refsOrIndex)
//
//------------------------------------------------------------------------------

let _driveCachePromise = null;

async function loadDriveCache() {
  if (_driveCachePromise) return _driveCachePromise;
  _driveCachePromise = (async () => {
    try {
      const res = await fetch("drive_cache.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`drive_cache.json http ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("[matcher] drive_cache.json not available", e);
      return {};
    }
  })();
  return _driveCachePromise;
}

function parseHash(h) {
  if (h == null) return null;
  if (typeof h === "bigint") return h;
  if (typeof h === "number") return BigInt(h >>> 0);
  if (typeof h !== "string") return null;
  const s = h.trim();
  if (s.startsWith("0x")) return BigInt(s);
  if (/^[0-9a-f]+$/i.test(s)) return BigInt("0x" + s);
  if (/^[01]+$/.test(s)) return BigInt("0b" + s);
  return null;
}

function ham64(a, b) {
  if (a == null || b == null) return 64;
  let x = a ^ b, c = 0;
  while (x) { x &= (x - 1n); c++; }
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function toRGBA(imgOrUrl, { trim = 0.06, size = 32 } = {}) {
  const img = typeof imgOrUrl === "string" ? await loadImage(imgOrUrl) : imgOrUrl;
  const sx = Math.floor(img.width * trim);
  const sy = Math.floor(img.height * trim);
  const sw = Math.max(1, img.width - 2 * sx);
  const sh = Math.max(1, img.height - 2 * sy);
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function channels(id, size = 32) {
  const n = size * size;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const gray = new Float32Array(n);
  const p = id.data;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const R = p[i], G = p[i+1], B = p[i+2];
    r[j] = R / 255; g[j] = G / 255; b[j] = B / 255;
    gray[j] = (0.2126*R + 0.7152*G + 0.0722*B)/255;
  }
  return { r, g, b, gray };
}

function aHash(vec, size = 32, h = 8) {
  const block = size / h;
  let sum = 0; for (let i=0;i<vec.length;i++) sum += vec[i];
  const avg = sum / vec.length;
  let bits = 0n;
  for (let y=0;y<h;y++) {
    for (let x=0;x<h;x++) {
      const gx = Math.min(size-1, Math.floor((x+0.5)*block));
      const gy = Math.min(size-1, Math.floor((y+0.5)*block));
      const v = vec[gy*size+gx];
      bits = (bits<<1n) | (v>=avg?1n:0n);
    }
  }
  return bits;
}

function dHash(vec, size = 32, w = 9, h = 8) {
  const sx = size / w, sy = size / h;
  let bits = 0n;
  for (let y=0;y<h;y++) {
    let prev = sample(vec,size,(0.5)*sx,(y+0.5)*sy);
    for (let x=1;x<w;x++) {
      const cur = sample(vec,size,(x+0.5)*sx,(y+0.5)*sy);
      bits = (bits<<1n)|(prev>cur?1n:0n);
      prev=cur;
    }
  }
  return bits;
}

function sample(vec,size,fx,fy){
  const x = Math.max(0,Math.min(size-1,Math.floor(fx)));
  const y = Math.max(0,Math.min(size-1,Math.floor(fy)));
  return vec[y*size+x];
}

function edgeHash(gray, size=32){
  const W=size,H=size;
  const mag=new Float32Array(W*H);
  const sobelX=[[-1,0,1],[-2,0,2],[-1,0,1]];
  const sobelY=[[-1,-2,-1],[0,0,0],[1,2,1]];
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      let gx=0,gy=0;
      for(let j=-1;j<=1;j++){
        for(let i=-1;i<=1;i++){
          const v=gray[(y+j)*W+(x+i)];
          gx+=v*sobelX[j+1][i+1];
          gy+=v*sobelY[j+1][i+1];
        }
      }
      mag[y*W+x]=Math.hypot(gx,gy);
    }
  }
  return aHash(mag,size,8);
}

function normalizeManifest(manifest){
  if(Array.isArray(manifest)){
    return manifest.map((e,i)=>({
      key:e.key||e.name||String(i),
      name:e.name||e.key||String(i),
      src:e.src||e.image||e.url||null
    }));
  }
  const out=[];
  if(manifest&&typeof manifest==="object"){
    for(const k of Object.keys(manifest)){
      const v=manifest[k]||{};
      out.push({key:k,name:v.name||k,src:v.src||v.image||v.url||null});
    }
  }
  return out;
}

export async function prepareRefIndex(manifest){
  const cache=await loadDriveCache();
  const norm=normalizeManifest(manifest);
  const list=norm.map(m=>{
    const c=cache[m.key]||cache[m.name]||{};
    return {
      key:m.key,name:m.name,src:c.src||m.src,
      ahash:parseHash(c.ahash),dhash:parseHash(c.dhash),
      phash:parseHash(c.phash),edgeHash:parseHash(c.edgeHash),
      ahashR:parseHash(c.ahashR),ahashG:parseHash(c.ahashG),ahashB:parseHash(c.ahashB),
      dhashR:parseHash(c.dhashR),dhashG:parseHash(c.dhashG),dhashB:parseHash(c.dhashB),
    };
  }).filter(e=>e.src);
  return {list,byKey:new Map(list.map(e=>[e.key,e]))};
}

async function hashCrop(dataUrl){
  const id=await toRGBA(dataUrl,{trim:0.06,size:32});
  const {r,g,b,gray}=channels(id,32);
  return {
    ahash:aHash(gray),dhash:dHash(gray),edgeHash:edgeHash(gray),
    ahashR:aHash(r),ahashG:aHash(g),ahashB:aHash(b),
    dhashR:dHash(r),dhashG:dHash(g),dhashB:dHash(b),
  };
}

export async function findBestMatch(cropUrl,refsIndexOrArray){
  const refs=Array.isArray(refsIndexOrArray)?refsIndexOrArray:(refsIndexOrArray?.list||[]);
  if(!cropUrl||!Array.isArray(refs)||refs.length===0) return null;
  const c=await hashCrop(cropUrl);
  const W={dhash:2,ahash:1,edge:1,dR:1,dG:1,dB:1,aR:0.5,aG:0.5,aB:0.5};
  const K=Math.min(120,refs.length);
  const coarse=refs.map(r=>({
    r,
    h:W.dhash*ham64(c.dhash,r.dhash)+
      W.dR*ham64(c.dhashR,r.dhashR)+
      W.dG*ham64(c.dhashG,r.dhashG)+
      W.dB*ham64(c.dhashB,r.dhashB)
  })).sort((a,b)=>a.h-b.h).slice(0,K);
  let best=null,bestScore=Infinity;
  for(const {r} of coarse){
    let score=
      W.dhash*ham64(c.dhash,r.dhash)+
      W.ahash*ham64(c.ahash,r.ahash)+
      W.edge*ham64(c.edgeHash,r.edgeHash)+
      W.dR*ham64(c.dhashR,r.dhashR)+
      W.dG*ham64(c.dhashG,r.dhashG)+
      W.dB*ham64(c.dhashB,r.dhashB)+
      W.aR*ham64(c.ahashR,r.ahashR)+
      W.aG*ham64(c.ahashG,r.ahashG)+
      W.aB*ham64(c.ahashB,r.ahashB);
    if(score<bestScore){bestScore=score;best=r;}
  }
  return best?{key:best.key,name:best.name,src:best.src,score:bestScore}:null;
}
