// src/utils/clipSession.js
import ort from "./ortEnv";

const __DBG__ = (window.__NBT_DEV = window.__NBT_DEV || {});
__DBG__.input224 = __DBG__.input224 || Object.create(null);

function _saveInput224(tag, canvas224, meta = {}) {
  try {
    const dataUrl = canvas224.toDataURL("image/png");
    __DBG__.input224[String(tag)] = { dataUrl, time: Date.now(), ...meta };
    window.dispatchEvent?.(new CustomEvent("nbt:input224", { detail: { tag: String(tag) } }));
  } catch {}
}

window.NBT_showInput = function NBT_showInput(cell) {
  const store = (__DBG__ && __DBG__.input224) || {};
  if (!cell) { console.table(Object.keys(store)); return; }
  const rec = store[String(cell)];
  if (!rec) { console.warn("No capture for cell", cell, "yet."); return; }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:99999;background:rgba(0,0,0,.85);padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);color:#fff;font:12px ui-monospace,monospace;";
  host.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center">
      <img src="${rec.dataUrl}" width="112" height="112" style="image-rendering:pixelated;border:1px solid rgba(255,255,255,.2);border-radius:8px"/>
      <div>
        <div><b>${new Date(rec.time).toLocaleTimeString()}</b></div>
        ${("bg" in rec && rec.bg) ? `<div style="display:flex;align-items:center;gap:6;margin-top:6">
          <div style="width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,.3);background:rgb(${rec.bg[0]},${rec.bg[1]},${rec.bg[2]})"></div>
          <span>BG ${rec.bg.join(",")} · ${Math.round((rec.bgFrac||0)*100)}% ${rec.attenuated?"· attenuated":""}</span>
        </div>` : ""}
        <button id="nbt-close" style="margin-top:8px;padding:4px 8px;border-radius:6px;background:#333;color:#fff;border:1px solid #555;cursor:pointer">Close</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  host.querySelector("#nbt-close").onclick = () => host.remove();
};

// --- tuner ---
function readTuner() { try { return JSON.parse(localStorage.getItem("nbt.tuner.v1")||"{}"); } catch { return {}; } }

// --- dominant BG helpers (same as before) ---
function detectDominantBg(canvas, { ring = 2, quant = 32 } = {}) {
  const w = canvas.width|0, h = canvas.height|0;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const ringRGB = [];
  const push = (y0,y1,x0,x1)=>{ const ys=Math.max(0,y0), ye=Math.min(h,y1), xs=Math.max(0,x0), xe=Math.min(w,x1);
    for(let y=ys;y<ye;y++) for(let x=xs;x<xe;x++){ const i=((y*w)+x)*4; ringRGB.push(data[i],data[i+1],data[i+2]); } };
  const r = Math.max(1, ring|0);
  push(0,r,0,w); push(h-r,h,0,w); push(0,h,0,r); push(0,h,w-r,w);
  const shift = Math.max(0, Math.floor(Math.log2(256/Math.max(2,quant|0))));
  const hist = new Map();
  const add = (R,G,B)=>{ const key = ((R>>shift)<<16)|((G>>shift)<<8)|(B>>shift); const rec=hist.get(key);
    if(rec){rec[0]++;rec[1]+=R;rec[2]+=G;rec[3]+=B;} else hist.set(key,[1,R,G,B]); };
  for(let i=0;i<ringRGB.length;i+=3) add(ringRGB[i],ringRGB[i+1],ringRGB[i+2]);
  let best=null; for(const [,v] of hist.entries()) if(!best||v[0]>best[0][0]) best=[v];
  if(!best) return { color:[139,139,139], fraction:0 };
  const [count,sumR,sumG,sumB]=best[0];
  return { color:[Math.round(sumR/count),Math.round(sumG/count),Math.round(sumB/count)], fraction:(ringRGB.length/3)?count/(ringRGB.length/3):0 };
}
function attenuateToNeutral(imgData, bgRgb, { sigma = 18, neutral = [139,139,139] } = {}) {
  const d = imgData.data; const [br,bg,bb]=bgRgb, [nr,ng,nb]=neutral; const inv2=1/(2*sigma*sigma);
  for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; const dr=r-br,dg=g-bg,db=b-bb;
    const w = 1 - Math.exp(-(dr*dr+dg*dg+db*db)*inv2);
    d[i]=Math.round(w*r+(1-w)*nr); d[i+1]=Math.round(w*g+(1-w)*ng); d[i+2]=Math.round(w*b+(1-w)*nb); }
  return imgData;
}

// --- ORT bootstrapping with timeout ---
let _sessionPromise = null;
const BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "");
const CANDIDATES = [
  `${BASE}/models/vision_model_int8_qlinear.onnx`,
  `${BASE}/models/vision_model.onnx`,
];

function ensureWasmBase() {
  const want = import.meta.env.DEV ? "/src/vendor/ort/" : "/ort/";
  if (ort.env.wasm.wasmPaths !== want) ort.env.wasm.wasmPaths = want;
  console.log("[clipSession] wasm base →", ort.env.wasm.wasmPaths);
}

async function fetchBytes(url) {
  console.log("[clipSession] fetching:", url);
  const res = await fetch(url, { cache: "no-store" });
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  console.log("[clipSession] fetched", bytes.byteLength, "bytes", res.status, res.headers.get("content-type")||"");
  if (!res.ok || bytes.byteLength < 1024) throw new Error(`Bad model fetch: ${res.status} ${bytes.byteLength}B`);
  return bytes;
}

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label||"operation"} timed out after ${ms}ms`)), ms))
  ]);
}

async function createFromBytes(url) {
  const bytes = await fetchBytes(url);
  console.log("[clipSession] creating session from BYTES…");
  return await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
}
async function createFromUrl(url) {
  console.log("[clipSession] creating session from URL…");
  return await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
}

export async function getClipSession() {
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    ensureWasmBase();
    let lastErr = null;
    for (const url of CANDIDATES) {
      try { return await withTimeout(createFromBytes(url), 12000, "Session create (bytes)"); }
      catch (e) { console.warn("[clipSession] bytes failed", url, e?.message||e); lastErr = e; }
      try { return await withTimeout(createFromUrl(url), 12000, "Session create (url)"); }
      catch (e) { console.warn("[clipSession] url failed", url, e?.message||e); lastErr = e; }
    }
    throw lastErr || new Error("No model candidate succeeded");
  })();
  return _sessionPromise;
}

// --- tag inference for dev capture ---
function inferCellTag(el) {
  if (!el || !(el instanceof Element)) return null;
  let v = el.getAttribute?.("data-cell") || el.dataset?.cell;
  if (v && Number.isFinite(+v)) return +v;
  const m = /cell\s*(\d+)/i.exec(el.getAttribute?.("alt") || "");
  if (m && Number.isFinite(+m[1])) return +m[1];
  try {
    const list = Array.from(document.querySelectorAll(".bingo-card .cell img.bingo-sprite"));
    const idx = list.indexOf(el);
    if (idx >= 0) return idx + 1;
  } catch {}
  return null;
}
function resolveTag(el, hint) {
  if (Number.isFinite(hint) && hint >= 1 && hint <= 25) return hint|0;
  const inf = inferCellTag(el); if (inf) return inf;
  const last = (window.__NBT_DEV && window.__NBT_DEV.lastCell) ? window.__NBT_DEV.lastCell : null;
  if (Number.isFinite(last) && last >= 1 && last <= 25) return last|0;
  return null;
}

// --- embed with BG attenuation + dev capture ---
export async function embedImage(canvasOrImage, session, tagHint) {
  const size = 224;
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  if (canvasOrImage) {
    const w = canvasOrImage.width || canvasOrImage.naturalWidth || size;
    const h = canvasOrImage.height || canvasOrImage.naturalHeight || size;
    ctx.drawImage(canvasOrImage, 0, 0, w, h, 0, 0, size, size);
  }

  const tuner = readTuner();
  let img = ctx.getImageData(0, 0, size, size);
  const dbg = { bg:null, bgFrac:null, attenuated:false };
  if (tuner.bgAtten !== false) {
    const { color, fraction } = detectDominantBg(c, { ring: 2, quant: 32 });
    dbg.bg = color; dbg.bgFrac = fraction;
    if (fraction >= 0.30) { img = attenuateToNeutral(img, color, { sigma: Number(tuner.bgSigma)||18 }); ctx.putImageData(img, 0, 0); dbg.attenuated = true; }
  }

  const tag = resolveTag(canvasOrImage, tagHint);
  if (tag) _saveInput224(tag, c, dbg);

  const data = img.data;
  const MEAN=[0.48145466,0.4578275,0.40821073], STD=[0.26862954,0.26130258,0.27577711];
  const plane = size*size;
  const x = new Float32Array(3*plane);
  for (let i=0;i<plane;i++){ const r=data[i*4]/255,g=data[i*4+1]/255,b=data[i*4+2]/255;
    x[0*plane+i]=(r-MEAN[0])/STD[0]; x[1*plane+i]=(g-MEAN[1])/STD[1]; x[2*plane+i]=(b-MEAN[2])/STD[2]; }
  const inputName = session.inputNames?.[0] || "pixel_values";
  const out = await session.run({ [inputName]: new ort.Tensor("float32", x, [1,3,size,size]) });
  const first = session.outputNames?.[0] || Object.keys(out)[0];
  let vec = out[first]?.data instanceof Float32Array ? out[first].data : new Float32Array(out[first]?.data||[]);
  if (out[first]?.dims?.length === 3 && out[first].dims[2] === 512) vec = vec.subarray(0,512);
  let s=0; for (let i=0;i<vec.length;i++) s+=vec[i]*vec[i];
  const inv = s>0 ? 1/Math.sqrt(s) : 0; for (let i=0;i<vec.length;i++) vec[i]*=inv;
  return vec;
}
