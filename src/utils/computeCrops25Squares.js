// src/utils/computeCrops25Squares.js
// Two-pass cleaner with debug taps + stronger rail sweep + alpha64 export.

export default function computeCrops25Squares(srcCanvas, fractions, opts = {}) {
  const { pass2 } = _computeAll(srcCanvas, fractions, opts, /*wantAlpha64*/ false);
  return pass2;
}

export function computeCrops25SquaresDebug(srcCanvas, fractions, opts = {}) {
  const { raw, pass1, pass2, alpha64s } = _computeAll(srcCanvas, fractions, opts, /*wantAlpha64*/ true);
  const out = [];
  for (let i = 0; i < 25; i++) {
    out.push({
      raw: raw[i],
      pass1: pass1[i],
      pass2: pass2[i],
      alpha64: alpha64s[i] || [],
      stats: {},
      params: {},
    });
  }
  return out;
}

export function toDevResults(debugPerCell) {
  return (debugPerCell || []).map(d => ({
    top: [],
    best: { ref: { name: "" } },
    debug: {
      raw:   d.raw,
      pass1: d.pass1,
      pass2: d.pass2,
      alpha64: d.alpha64 || [],
      stats:   d.stats   || {},
      params:  d.params  || {},
    },
  }));
}

function _computeAll(srcCanvas, fractions, opts, wantAlpha64) {
  if (!srcCanvas || !fractions) {
    return {
      raw: Array(25).fill(null),
      pass1: Array(25).fill(null),
      pass2: Array(25).fill(null),
      alpha64s: Array(25).fill([]),
    };
  }

  const {
    lineInsetPx = 0,
    innerInsetPct = 0.06,
    feather = 0,
    padRatio = 1.10,          // slightly tighter by default
    outSize: forcedOutSize = null,
  } = opts;

  const w = srcCanvas.width, h = srcCanvas.height;
  const Smin = Math.min(w, h);
  const S = Math.max(10, (fractions.size ?? 0.8) * Smin);
  const X = clamp((fractions.x ?? 0) * w, 0, Math.max(0, w - S));
  const Y = clamp((fractions.y ?? 0) * h, 0, Math.max(0, h - S));
  const cell = S / 5;

  const raw = [], pass1 = [], pass2 = [], alpha64s = [];

  // tuneables
  const p1Params = { ringOffset: 3, ringWidth: 3, rgbThr: 12, satThr: 0.15, varThr: 8 };
  const p2Params = { k: 3, satThr: 0.22, baseThr: 5.0, alphaMAD: 3.0, beta: 0.6, edgeBand: 3 };

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const sx = Math.round(X + c * cell);
      const sy = Math.round(Y + r * cell);
      const sSize = Math.round(cell);
      const outSize = forcedOutSize || sSize;

      const base = drawSquare(srcCanvas, sx, sy, sSize);

      const shaved = lineInsetPx > 0 ? insetCanvas(base, lineInsetPx) : base;
      const inner  = innerInsetPct > 0 ? insetCanvas(shaved, Math.round(innerInsetPct * shaved.width)) : shaved;

      const p1 = pass1_edgeConnected(inner, p1Params);
      const p2 = pass2_clusterGrow(inner, p1, p2Params);

      // stronger iterative rail clean-up
      let mask = p2.fgMask;
      for (let it = 0; it < 3; it++) {
        const swept = sweepEdgeStripsIter(p1.imgData, p1.lvar, p1.bgRGB, mask, { maxSweep: 6, rgbThr: 12, varQuantile: 0.25, bandAgree: 0.72 });
        if (sameMask(mask, swept)) break;
        mask = swept;
      }

      // if degenerate, trim & regrow
      const cov = coverage(mask);
      if (cov > 0.95 || cov < 0.05) {
        const trimmed = trimUniformMargins(p1.imgData, mask, { lumaStdThr: 7 });
        mask = regrowFromFG(p1.imgData, trimmed, p2Params);
      }

      const p1Canvas = toPaddedRGBA(inner, p1.fgMask, { padRatio, outSize, feather });
      const p2Canvas = toPaddedRGBA(inner, mask,      { padRatio, outSize, feather });

      raw.push(base);
      pass1.push(p1Canvas);
      pass2.push(p2Canvas);
      if (wantAlpha64) alpha64s.push(maskTo64(mask, inner.width, inner.height)); else alpha64s.push([]);
    }
  }

  return { raw, pass1, pass2, alpha64s };
}

// ---------- helpers ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function drawSquare(src, sx, sy, s) {
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(src, sx, sy, s, s, 0, 0, s, s);
  return c;
}
function insetCanvas(c, px) {
  const s = Math.max(1, Math.min(c.width, c.height) - 2 * px);
  const o = document.createElement("canvas");
  o.width = s; o.height = s;
  const g = o.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(c, px, px, s, s, 0, 0, s, s);
  return o;
}
function getImageData(canvas) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
function luma(r,g,b){ return 0.299*r + 0.587*g + 0.114*b; }
function rgbToHSV_S(r, g, b) {
  const rf=r/255, gf=g/255, bf=b/255;
  const mx=Math.max(rf,gf,bf), mn=Math.min(rf,gf,bf);
  const d=mx-mn; return (mx===0?0:d/mx);
}
function localVar3(id) {
  const { width:w, height:h, data } = id;
  const L = new Float32Array(w*h);
  for (let i=0,p=0;i<data.length;i+=4,p++) L[p]=luma(data[i],data[i+1],data[i+2]);
  const out = new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    let s=0,s2=0,n=0;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){ const p=(y+j)*w+(x+i); const v=L[p]; s+=v; s2+=v*v; n++; }
    const mean=s/n; out[y*w+x]=Math.max(0,s2/n - mean*mean);
  }
  return out;
}
function ringMedianRGB(id, ringOffset=3, ringWidth=3) {
  const { width:w, height:h, data } = id;
  const xs=[], ys=[], zs=[];
  const x0=ringOffset, x1=w-ringOffset-1, y0=ringOffset, y1=h-ringOffset-1;
  const take=(x,y)=>{ const i=(y*w+x)<<2; xs.push(data[i]); ys.push(data[i+1]); zs.push(data[i+2]); };
  for(let x=x0;x<=x1;x++){ for(let t=0;t<ringWidth;t++){ take(x,y0+t); take(x,y1-t);} }
  for(let y=y0;y<=y1;y++){ for(let t=0;t<ringWidth;t++){ take(x0+t,y); take(x1-t,y);} }
  const med=(arr)=>{ if(!arr.length) return 180; const a=arr.slice().sort((a,b)=>a-b);
    const k=Math.floor(0.1*a.length); const b=a.slice(k, a.length-k || a.length);
    const m=Math.floor(b.length/2); return b.length%2?b[m]:Math.round((b[m-1]+b[m])/2); };
  return [med(xs), med(ys), med(zs)];
}

// ---------- passes ----------
function pass1_edgeConnected(cellCanvas, { ringOffset, ringWidth, rgbThr, satThr, varThr }) {
  const id = getImageData(cellCanvas);
  const { width:w, height:h, data } = id;

  const bgRGB = ringMedianRGB(id, ringOffset, ringWidth);
  const lvar = localVar3(id);

  const seed = new Uint8Array(w*h);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const p=y*w+x, i=p<<2;
    const r=data[i], g=data[i+1], b=data[i+2];
    const dr=r-bgRGB[0], dg=g-bgRGB[1], db=b-bgRGB[2];
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    const s = rgbToHSV_S(r,g,b);
    if (dist < rgbThr && s < satThr && lvar[p] < varThr) seed[p]=1;
  }

  const bg1 = new Uint8Array(w*h);
  const q=[];
  const push=(x,y)=>{ if (x<0||y<0||x>=w||y>=h) return; const p=y*w+x; if(!bg1[p]&&seed[p]){bg1[p]=1;q.push(p);} };
  for (let x=0;x<w;x++){ push(x,0); push(x,h-1); }
  for (let y=0;y<h;y++){ push(0,y); push(w-1,y); }
  while(q.length){
    const p=q.pop(), x=p%w, y=(p/w)|0;
    push(x-1,y); push(x+1,y); push(x,y-1); push(x,y+1);
  }

  const fg1 = new Uint8Array(w*h); for (let p=0;p<fg1.length;p++) fg1[p]=bg1[p]?0:1;
  return { imgData:id, lvar, bgRGB, fgMask:fg1, bgMask:bg1 };
}

function pass2_clusterGrow(cellCanvas, pass1, { k, satThr, baseThr, alphaMAD, beta, edgeBand }) {
  const { imgData:id, bgMask:bg1 } = pass1;
  const { width:w, height:h, data } = id;

  const pts=[]; for (let p=0;p<bg1.length;p++) if (bg1[p]) { const i=p<<2; pts.push([data[i],data[i+1],data[i+2]]); }
  if (!pts.length) return { fgMask: pass1.fgMask, bgMask: bg1 };

  const K=Math.max(1, Math.min(k, pts.length));
  const centers=[pts[Math.floor(Math.random()*pts.length)].slice()];
  for(let t=1;t<K;t++){
    let best=0, pick=centers[0];
    for(const px of pts){
      let dmin=Infinity;
      for(const c of centers){
        const dx=px[0]-c[0], dy=px[1]-c[1], dz=px[2]-c[2];
        const d=dx*dx + dy*dy + dz*dz;
        dmin=Math.min(dmin, d);
      }
      if(dmin>best){best=dmin; pick=px;}
    }
    centers.push(pick.slice());
  }
  const labels=new Array(pts.length).fill(0);
  for(let it=0;it<8;it++){
    for(let i=0;i<pts.length;i++){
      let j=0,b=Infinity;
      for(let c=0;c<centers.length;c++){
        const dx=pts[i][0]-centers[c][0], dy=pts[i][1]-centers[c][1], dz=pts[i][2]-centers[c][2];
        const d=dx*dx + dy*dy + dz*dz;
        if(d<b){b=d;j=c;}
      }
      labels[i]=j;
    }
    const sums=centers.map(()=>[0,0,0]), cnts=centers.map(()=>0);
    for(let i=0;i<pts.length;i++){ const j=labels[i]; cnts[j]++; sums[j][0]+=pts[i][0]; sums[j][1]+=pts[i][1]; sums[j][2]+=pts[i][2]; }
    for(let j=0;j<centers.length;j++){ if(cnts[j]) centers[j]=[sums[j][0]/cnts[j], sums[j][1]/cnts[j], sums[j][2]/cnts[j]]; }
  }
  const mads=centers.map(()=>0), cnts=centers.map(()=>0);
  for(let i=0;i<pts.length;i++){ const j=labels[i]; const c=centers[j]; const dx=pts[i][0]-c[0], dy=pts[i][1]-c[1], dz=pts[i][2]-c[2];
    mads[j]+=Math.sqrt(dx*dx+dy*dy+dz*dz); cnts[j]++; }
  for(let j=0;j<centers.length;j++) mads[j] = cnts[j] ? (mads[j]/cnts[j]) : 0;
  const taus = mads.map(m => Math.max(baseThr, alphaMAD*m + beta));

  const nearAny = (p) => {
    const i=p<<2; let b=Infinity, jb=0;
    for (let j=0;j<centers.length;j++){ const c=centers[j]; const dx=data[i]-c[0], dy=data[i+1]-c[1], dz=data[i+2]-c[2];
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz); if (d<b){ b=d; jb=j; } }
    return b <= taus[jb];
  };

  const seed = new Uint8Array(w*h);
  const seedAt=(x,y)=>{ const p=y*w+x; const i=p<<2;
    if (nearAny(p) && rgbToHSV_S(data[i],data[i+1],data[i+2]) < satThr) seed[p]=1; };
  for(let x=0;x<w;x++){ seedAt(x,0); seedAt(x,h-1); }
  for(let y=0;y<h;y++){ seedAt(0,y); seedAt(w-1,y); }

  const bg2=new Uint8Array(bg1);
  const q=[]; for(let p=0;p<seed.length;p++) if(seed[p]){ bg2[p]=1; q.push(p); }
  while(q.length){
    const p=q.pop(), x=p%w, y=(p/w)|0;
    const tryN=(xx,yy)=>{ if(xx<0||yy<0||xx>=w||yy>=h) return; const pp=yy*w+xx; if(bg2[pp]) return;
      const i=pp<<2;
      if (nearAny(pp) && rgbToHSV_S(data[i],data[i+1],data[i+2]) < satThr){ bg2[pp]=1; q.push(pp); } };
    tryN(x-1,y); tryN(x+1,y); tryN(x,y-1); tryN(x,y+1);
  }

  const coverage = 0.8;
  const band = (edgeBand ?? 3);

  for (let y=0; y<band; y++){ let ok=0; for (let x=0;x<w;x++) if (nearAny(y*w+x)) ok++; if (ok/w > coverage) for (let x=0;x<w;x++) bg2[y*w+x]=1; }
  for (let y=h-band; y<h; y++){ let ok=0; for (let x=0;x<w;x++) if (nearAny(y*w+x)) ok++; if (ok/w > coverage) for (let x=0;x<w;x++) bg2[y*w+x]=1; }
  for (let x=0; x<band; x++){ let ok=0; for (let y=0;y<h;y++) if (nearAny(y*w+x)) ok++; if (ok/h > coverage) for (let y=0;y<h;y++) bg2[y*w+x]=1; }
  for (let x=w-band; x<w; x++){ let ok=0; for (let y=0;y<h;y++) if (nearAny(y*w+x)) ok++; if (ok/h > coverage) for (let y=0;y<h;y++) bg2[y*w+x]=1; }

  const fg2=new Uint8Array(w*h); for(let p=0;p<fg2.length;p++) fg2[p]=bg2[p]?0:1;
  return { fgMask:fg2, bgMask:bg2 };
}

// iterative rail sweeper (rows/cols close to ring color & low variance)
function sweepEdgeStripsIter(id, lvar, ringRGB, fgMask, { maxSweep=6, rgbThr=12, varQuantile=0.25, bandAgree=0.72 }) {
  const { width:w, height:h, data } = id;
  const out = new Uint8Array(fgMask);
  const varVals = Array.from(lvar).filter(Number.isFinite).sort((a,b)=>a-b);
  const varThr = varVals[Math.floor(varVals.length*varQuantile)] || 0;
  const nearRing = (i) => {
    const dr=data[i]-ringRGB[0], dg=data[i+1]-ringRGB[1], db=data[i+2]-ringRGB[2];
    return Math.sqrt(dr*dr+dg*dg+db*db) <= rgbThr;
  };
  // columns
  for (let dx=0; dx<maxSweep; dx++) {
    let good=0, lowv=0; for (let y=0;y<h;y++){ const p=y*w+dx; const i=p<<2; if (nearRing(i)) good++; if (lvar[p] <= varThr) lowv++; }
    if (good/h > bandAgree && lowv/h > bandAgree) for (let y=0;y<h;y++) out[y*w+dx]=0;
    good=0; lowv=0; const xr = w-1-dx;
    for (let y=0;y<h;y++){ const p=y*w+xr; const i=p<<2; if (nearRing(i)) good++; if (lvar[p] <= varThr) lowv++; }
    if (good/h > bandAgree && lowv/h > bandAgree) for (let y=0;y<h;y++) out[y*w+xr]=0;
  }
  // rows
  for (let dy=0; dy<maxSweep; dy++) {
    let good=0, lowv=0; for (let x=0;x<w;x++){ const p=dy*w+x; const i=p<<2; if (nearRing(i)) good++; if (lvar[p] <= varThr) lowv++; }
    if (good/w > bandAgree && lowv/w > bandAgree) for (let x=0;x<w;x++) out[dy*w+x]=0;
    good=0; lowv=0; const yb = h-1-dy;
    for (let x=0;x<w;x++){ const p=yb*w+x; const i=p<<2; if (nearRing(i)) good++; if (lvar[p] <= varThr) lowv++; }
    if (good/w > bandAgree && lowv/w > bandAgree) for (let x=0;x<w;x++) out[yb*w+x]=0;
  }
  return out;
}

function sameMask(a,b){ if (a===b) return true; if (!a||!b||a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false; return true; }

function trimUniformMargins(id, fgMask, { lumaStdThr=7 } = {}) {
  const { width:w, height:h, data } = id;
  const lum = new Float32Array(w*h);
  for (let y=0, p=0; y<h; y++) for (let x=0; x<w; x++, p+=1) {
    const i=(y*w+x)<<2; lum[p]=luma(data[i],data[i+1],data[i+2]);
  }
  const colStd = (x)=>{ let s=0,s2=0; for(let y=0;y<h;y++){ const v=lum[y*w+x]; s+=v; s2+=v*v; } const n=h, m=s/n; return Math.sqrt(Math.max(0, s2/n - m*m)); };
  const rowStd = (y)=>{ let s=0,s2=0; for(let x=0;x<w;x++){ const v=lum[y*w+x]; s+=v; s2+=v*v; } const n=w, m=s/n; return Math.sqrt(Math.max(0, s2/n - m*m)); };
  let left=0; while(left<w-1 && colStd(left)  < lumaStdThr) left++;
  let right=w-1; while(right>left && colStd(right) < lumaStdThr) right--;
  let top=0; while(top<h-1 && rowStd(top) < lumaStdThr) top++;
  let bottom=h-1; while(bottom>top && rowStd(bottom) < lumaStdThr) bottom--;
  const out = new Uint8Array(w*h);
  for (let y=top; y<=bottom; y++) for (let x=left; x<=right; x++) out[y*w+x]=1;
  return out;
}

function regrowFromFG(id, fgMask) {
  const { width:w, height:h } = id;
  const out = new Uint8Array(fgMask);
  for (let it=0; it<1; it++){
    const d=new Uint8Array(out);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const p=y*w+x; if (out[p]){ d[p]=1; if(x>0)d[y*w+x-1]=1; if(x<w-1)d[y*w+x+1]=1; if(y>0)d[(y-1)*w+x]=1; if(y<h-1)d[(y+1)*w+x]=1; }
    }
    const e=new Uint8Array(d);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const p=y*w+x;
      const n = d[p] && (x>0?d[y*w+x-1]:0) && (x<w-1?d[y*w+x+1]:0) && (y>0?d[(y-1)*w+x]:0) && (y<h-1?d[(y+1)*w+x]:0);
      e[p]=n?1:0;
    }
    for(let i=0;i<out.length;i++) out[i]=e[i];
  }
  return out;
}

// Centering-fixed crop (round + parity guard)
function toPaddedRGBA(cellCanvas, fgMask, { padRatio = 1.10, outSize = 128, feather = 0 } = {}) {
  const id = getImageData(cellCanvas);
  const { width: w, height: h, data } = id;

  let minX=w, minY=h, maxX=-1, maxY=-1, n=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (fgMask[y*w+x]){ n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  if (!n) { minX=1; minY=1; maxX=w-2; maxY=h-2; }

  const bw=maxX-minX+1, bh=maxY-minY+1;
  const side = Math.max(1, Math.ceil(padRatio * Math.max(bw, bh)));
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  let x0 = Math.round(cx - side/2);
  let y0 = Math.round(cy - side/2);

  const bboxParity = (bw % 2) ^ (bh % 2);
  const sideParity = side % 2;
  if (bboxParity !== sideParity) { if (x0>0) x0 -= 1; if (y0>0) y0 -= 1; }

  x0 = clamp(x0, 0, Math.max(0, w - side));
  y0 = clamp(y0, 0, Math.max(0, h - side));

  const rgba = new Uint8ClampedArray(w*h*4);
  for (let p=0,i=0; p<fgMask.length; p++,i+=4){ rgba[i]=data[i]; rgba[i+1]=data[i+1]; rgba[i+2]=data[i+2]; rgba[i+3]=fgMask[p]?255:0; }

  if (feather>0){
    for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){
      const p=y*w+x, i=(p<<2)+3;
      if (rgba[i]===0 && (
        rgba[((y-1)*w + x)*4 + 3]===255 ||
        rgba[((y+1)*w + x)*4 + 3]===255 ||
        rgba[(y*w + (x-1))*4 + 3]===255 ||
        rgba[(y*w + (x+1))*4 + 3]===255
      )) rgba[i]=128;
    }
  }

  const full = document.createElement("canvas");
  full.width=w; full.height=h;
  full.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);

  const crop = document.createElement("canvas");
  crop.width=side; crop.height=side;
  crop.getContext("2d", { willReadFrequently:true, alpha:true })
      .drawImage(full, x0, y0, side, side, 0, 0, side, side);

  const out = document.createElement("canvas");
  out.width = outSize; out.height = outSize;
  const g = out.getContext("2d", { willReadFrequently:true, alpha:true });
  g.imageSmoothingEnabled = false;
  g.drawImage(crop, 0, 0, outSize, outSize);
  return out;
}

function coverage(mask){ let s=0; for(let i=0;i<mask.length;i++) s+=mask[i]; return s/mask.length; }

function maskTo64(fgMask, w, h, dim = 64) {
  const out = new Float32Array(dim * dim);
  for (let y = 0; y < dim; y++) {
    const sy = Math.floor((y / dim) * h);
    const rowOff = sy * w;
    for (let x = 0; x < dim; x++) {
      const sx = Math.floor((x / dim) * w);
      out[y * dim + x] = fgMask[rowOff + sx] ? 1 : 0;
    }
  }
  return out;
}
