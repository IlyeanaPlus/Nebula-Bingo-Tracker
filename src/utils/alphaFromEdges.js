// src/utils/alphaFromEdges.js
// Transparency from outer-edge background modeling + flood + largest blob.
// Exposes BOTH a named export `alphaFromEdges` and a default export.

function alphaFromEdges(
  srcCanvas,
  {
    dim = 64,              // working mask resolution
    edgeBand = 2,          // pixels of outer ring to seed flood / sample BG
    kDualBG = true,        // allow two BG tones (light/dark ring)
    tau = 12,              // ΔE tolerance for "background-like"
    largestBlob = true,    // keep largest non-edge component
    growPx = 1,            // small dilation to recover outlines
    featherPx = 2,         // soften edge
    neutral = 0.5,         // 0..1 gray for neutral composite
    outSize = null,        // {w,h} output canvas size (defaults to source)
  } = {}
) {
  const W = srcCanvas?.width | 0, H = srcCanvas?.height | 0;
  if (!W || !H) return _emptyOut(srcCanvas);

  // 1) downsample to dim×dim
  const d = _resizeCanvas(srcCanvas, dim, dim);
  const dg = d.getContext("2d", { willReadFrequently: true });
  const di = dg.getImageData(0, 0, dim, dim);
  const lab = _rgbToLabImage(di);

  // 2) background model from outer edge
  const edgeLabs = _collectEdgeLAB(lab, dim, dim, edgeBand);
  let C_bg1, C_bg2;
  if (kDualBG && edgeLabs.length >= 2) {
    const [lo, hi] = _splitByL(edgeLabs);
    C_bg1 = _meanLab(lo.length ? lo : edgeLabs);
    C_bg2 = _meanLab(hi.length ? hi : edgeLabs);
  } else {
    C_bg1 = _meanLab(edgeLabs);
  }

  // 3) flood from edges using ΔE to C_bg1/C_bg2
  const mask = new Float32Array(dim * dim);
  for (let i = 0; i < mask.length; i++) mask[i] = 1;
  _floodFromEdges(mask, lab, dim, dim, edgeBand, C_bg1, C_bg2, tau, 0.65);

  // 4) blob select + grow + feather
  if (largestBlob) _keepLargestNonEdge(mask, dim, dim, 1);
  if (growPx > 0) _growMask(mask, dim, dim, growPx, 0.7);
  if (featherPx > 0) _featherMask(mask, dim, dim, featherPx);

  // 5) outputs
  const alphaMask64 = mask.slice();
  const shape8x8 = _to8x8Binary(mask, dim, dim);

  const matteData   = _compositePremultiplied(di, mask);
  const neutralData = _compositeOnNeutral(di, mask, Math.round(neutral * 255));

  const outW = outSize?.w ?? W, outH = outSize?.h ?? H;
  const matteCanvas   = _imageDataToSizedCanvas(matteData, dim, dim, outW, outH);
  const neutralCanvas = _imageDataToSizedCanvas(neutralData, dim, dim, outW, outH);

  return {
    matteCanvas,
    neutralCanvas,
    alphaMask64,
    shape8x8,
    stats: { C_bg1, C_bg2, tau, edgeBand },
    debug: { crop: srcCanvas, matte: matteCanvas, neutral: neutralCanvas },
  };
}

/* =================== helpers =================== */
function _emptyOut(src) {
  return { matteCanvas: src, neutralCanvas: src, alphaMask64: null, shape8x8: null, stats: { skipped: true }, debug: {} };
}
function _resizeCanvas(src, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
  return c;
}
function _imageDataToSizedCanvas(imgData, sw, sh, W, H) {
  const tmp = document.createElement("canvas");
  tmp.width = sw; tmp.height = sh;
  tmp.getContext("2d").putImageData(imgData, 0, 0);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, sw, sh, 0, 0, W, H);
  return c;
}

function _rgbToLabImage(imgData) {
  const { data, width, height } = imgData;
  const out = new Float32Array(width * height * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
    const r = _srgb2lin(data[i] / 255);
    const g = _srgb2lin(data[i + 1] / 255);
    const b = _srgb2lin(data[i + 2] / 255);
    const [L, a, b2] = _linrgb2lab(r, g, b);
    out[p] = L; out[p + 1] = a; out[p + 2] = b2;
  }
  return out;
}
function _srgb2lin(u){return u<=0.04045?u/12.92:Math.pow((u+0.055)/1.055,2.4);}
function _linrgb2lab(r,g,b){
  const x=(0.4124564*r+0.3575761*g+0.1804375*b)/0.95047;
  const y= 0.2126729*r+0.7151522*g+0.0721750*b;
  const z=(0.0193339*r+0.1191920*g+0.9503041*b)/1.08883;
  const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;
  const fx=f(x), fy=f(y), fz=f(z);
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)];
}
function _getLab(lab,w,x,y){const i=(y*w+x)*3; return [lab[i],lab[i+1],lab[i+2]];}
function _dE(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function _collectEdgeLAB(lab,w,h,b){
  const out=[];
  for(let x=0;x<w;x++) for(let t=0;t<b;t++){ out.push(_getLab(lab,w,x,t)); out.push(_getLab(lab,w,x,h-1-t)); }
  for(let y=0;y<h;y++) for(let t=0;t<b;t++){ out.push(_getLab(lab,w,t,y)); out.push(_getLab(lab,w,w-1-t,y)); }
  return out;
}
function _splitByL(samples){
  const Ls = samples.map(v=>v[0]).sort((a,b)=>a-b);
  const med = Ls[Math.floor(Ls.length/2)];
  const lo=[],hi=[];
  for(const v of samples){ (v[0]<=med?lo:hi).push(v); }
  return [lo,hi];
}
function _meanLab(list){
  if (!list.length) return [50,0,0];
  let L=0,a=0,b=0; for(const v of list){L+=v[0];a+=v[1];b+=v[2];}
  const n=list.length; return [L/n,a/n,b/n];
}
function _floodFromEdges(mask, lab, w, h, band, C1, C2, tau, maxFrac=0.6){
  const N=w*h, lim=Math.floor(N*maxFrac);
  const seen=new Uint8Array(N);
  const qx=new Uint16Array(N), qy=new Uint16Array(N);
  let qh=0, qt=0, carved=0;
  const push=(x,y)=>{
    if(x<0||y<0||x>=w||y>=h) return;
    const idx=y*w+x; if(seen[idx]) return; seen[idx]=1;
    const v=_getLab(lab,w,x,y);
    const isBG = (_dE(v,C1)<=tau) || (C2 && _dE(v,C2)<=tau);
    if(isBG){ mask[idx]=0; qx[qt]=x; qy[qt]=y; qt=(qt+1)%N; carved++; }
  };
  for(let x=0;x<w;x++){ for(let t=0;t<band;t++){ push(x,t); push(x,h-1-t); } }
  for(let y=0;y<h;y++){ for(let t=0;t<band;t++){ push(t,y); push(w-1-t,y); } }
  while(qh!==qt && carved<lim){
    const x=qx[qh], y=qy[qh]; qh=(qh+1)%N;
    push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1);
  }
}
function _keepLargestNonEdge(mask,w,h,edge=1){
  const bin=new Uint8Array(mask.length);
  for(let i=0;i<bin.length;i++) bin[i]=mask[i]>0.5?1:0;
  const visited=new Uint8Array(bin.length);
  const qx=new Uint16Array(bin.length), qy=new Uint16Array(bin.length);
  const inEdge=(x,y)=>(x<edge||y<edge||x>=w-edge||y>=h-edge);
  let best=null,bestA=0;
  for(let y0=0;y0<h;y0++){
    for(let x0=0;x0<w;x0++){
      const i0=y0*w+x0; if(!bin[i0]||visited[i0]) continue;
      let area=0,touch=false; const comp=[];
      let hq=0,tq=0; qx[tq]=x0; qy[tq]=y0; tq=(tq+1)%qx.length; visited[i0]=1;
      while(hq!==tq){
        const x=qx[hq], y=qy[hq]; hq=(hq+1)%qx.length;
        const idx=y*w+x; comp.push(idx); area++; if(inEdge(x,y)) touch=true;
        if(x>0){const j=idx-1;if(bin[j]&&!visited[j]){visited[j]=1; qx[tq]=x-1; qy[tq]=y; tq=(tq+1)%qx.length;}}
        if(x+1<w){const j=idx+1;if(bin[j]&&!visited[j]){visited[j]=1; qx[tq]=x+1; qy[tq]=y; tq=(tq+1)%qx.length;}}
        if(y>0){const j=idx-w;if(bin[j]&&!visited[j]){visited[j]=1; qx[tq]=x; qy[tq]=y-1; tq=(tq+1)%qx.length;}}
        if(y+1<h){const j=idx+w;if(bin[j]&&!visited[j]){visited[j]=1; qx[tq]=x; qy[tq]=y+1; tq=(tq+1)%qx.length;}}
      }
      if(!touch && area>bestA){best=comp; bestA=area;}
      if(!best && area>bestA){best=comp; bestA=area;}
    }
  }
  const keep=new Uint8Array(mask.length); if(best) for(const i of best) keep[i]=1;
  for(let i=0;i<mask.length;i++) mask[i]=keep[i]?mask[i]:0;
}
function _growMask(mask,w,h,r=1,val=0.7){
  const out=new Float32Array(mask);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x; if(mask[i]>0) continue;
      let hit=false;
      for(let yy=Math.max(0,y-r); yy<=Math.min(h-1,y+r) && !hit; yy++){
        for(let xx=Math.max(0,x-r); xx<=Math.min(w-1,x+r) && !hit; xx++){
          if(mask[yy*w+xx]>0.7) hit=true;
        }
      }
      if(hit) out[i]=val;
    }
  }
  for(let i=0;i<mask.length;i++) mask[i]=out[i];
}
function _featherMask(mask,w,h,r=2){
  const out=new Float32Array(mask), rr=r*r;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x; if(mask[i]===1) continue;
      for(let yy=Math.max(0,y-r); yy<=Math.min(h-1,y+r); yy++){
        for(let xx=Math.max(0,x-r); xx<=Math.min(w-1,x+r); xx++){
          const j=yy*w+xx; if(mask[j]===1){
            const dx=xx-x, dy=yy-y, d2=dx*dx+dy*dy;
            if(d2<=rr){ out[i]=Math.max(out[i], 1 - Math.sqrt(d2)/r); }
          }
        }
      }
    }
  }
  for(let i=0;i<mask.length;i++) mask[i]=Math.max(mask[i], out[i]*0.5);
}
function _to8x8Binary(mask,w,h){
  const dim=8, cw=w/dim, ch=h/dim, out=new Uint8Array(dim*dim);
  for(let gy=0;gy<dim;gy++){
    for(let gx=0;gx<dim;gx++){
      let s=0,n=0;
      const x0=Math.floor(gx*cw), x1=Math.floor((gx+1)*cw);
      const y0=Math.floor(gy*ch), y1=Math.floor((gy+1)*ch);
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=mask[y*w+x]; n++; }
      out[gy*dim+gx]=(s/(n||1)>0.5)?1:0;
    }
  }
  return out;
}
function _compositePremultiplied(imgData,mask){
  const {data,width,height}=imgData; const out=new ImageData(width,height);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const a=Math.max(0,Math.min(1,mask[p]));
    out.data[i]=Math.round(data[i]*a);
    out.data[i+1]=Math.round(data[i+1]*a);
    out.data[i+2]=Math.round(data[i+2]*a);
    out.data[i+3]=Math.round(a*255);
  }
  return out;
}
function _compositeOnNeutral(imgData,mask,n255=128){
  const {data,width,height}=imgData; const out=new ImageData(width,height);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const a=Math.max(0,Math.min(1,mask[p]));
    out.data[i]=Math.round(data[i]*a + n255*(1-a));
    out.data[i+1]=Math.round(data[i+1]*a + n255*(1-a));
    out.data[i+2]=Math.round(data[i+2]*a + n255*(1-a));
    out.data[i+3]=255;
  }
  return out;
}

/* re-export helpers internally if needed later */
// (none)

export { alphaFromEdges };
export default alphaFromEdges;
