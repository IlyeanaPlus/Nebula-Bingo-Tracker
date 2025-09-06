export function loadImageFromFile(file){
  return new Promise((res,rej)=>{
    const img=new Image(); img.onload=()=>res(img); img.onerror=rej;
    img.src=URL.createObjectURL(file);
  });
}
function toCanvas(w,h){const c=document.createElement("canvas"); c.width=w; c.height=h; return c}
function ctx2d(w,h){return toCanvas(w,h).getContext("2d",{willReadFrequently:true})}
function getImageData(img,x,y,w,h){const c=ctx2d(w,h); c.drawImage(img,x,y,w,h,0,0,w,h); return c.getImageData(0,0,w,h)}
function splitRGB(id){const R=[],G=[],B=[]; for(let i=0;i<id.data.length;i+=4){R.push(id.data[i]);G.push(id.data[i+1]);B.push(id.data[i+2]);} return {R,G,B}}
function graySample(id,w,h){const g=new Uint8Array(w*h); for(let i=0,j=0;i<id.data.length;i+=4,j++){const r=id.data[i],gn=id.data[i+1],b=id.data[i+2]; g[j]=(r*299+gn*587+b*114)/1000|0} return g}

export async function computeAHash(source,size=8){
  const id=source instanceof ImageData?source:getImageData(source,0,0,size,size);
  const g=source instanceof ImageData?graySample(source,source.width,source.height):graySample(id,size,size);
  const avg=g.reduce((a,b)=>a+b,0)/(g.length||1);
  let h=0n; for(let i=0;i<g.length;i++) if(g[i]>=avg) h|=1n<<BigInt(i);
  return Number(h & 0xffffffffn);
}
export async function computeAHashRGB(source,size=8){
  const id=getImageData(source,0,0,size,size);
  const {R,G,B}=splitRGB(id);
  function ch(v){const avg=v.reduce((a,b)=>a+b,0)/v.length; let h=0n; for(let i=0;i<v.length;i++) if(v[i]>=avg) h|=1n<<BigInt(i); return Number(h & 0xffffffffn);}
  return {r:ch(R),g:ch(G),b:ch(B)};
}

export async function computeDHashX(source,size=8){
  const w=size+1,h=size; const id=getImageData(source,0,0,w,h); const g=graySample(id,w,h);
  let bits=0; let k=0; for(let y=0;y<h;y++) for(let x=0;x<size;x++,k++){const a=g[y*w+x],b=g[y*w+x+1]; if(a>b) bits|=(1<<k)}
  return bits>>>0;
}
export async function computeDHashXRGB(source,size=8){
  const w=size+1,h=size; const id=getImageData(source,0,0,w,h); const {R,G,B}=splitRGB(id);
  function ch(v){let bits=0,k=0; for(let y=0;y<h;y++) for(let x=0;x<size;x++,k++){const a=v[y*w+x],b=v[y*w+x+1]; if(a>b) bits|=(1<<k)} return bits>>>0;}
  return {r:ch(R),g:ch(G),b:ch(B)};
}

export async function computeDHashY(source,size=8){
  const w=size,h=size+1; const id=getImageData(source,0,0,w,h); const g=graySample(id,w,h);
  let bits=0; let k=0; for(let y=0;y<size;y++) for(let x=0;x<w;x++,k++){const a=g[y*w+x],b=g[(y+1)*w+x]; if(a>b) bits|=(1<<k)}
  return bits>>>0;
}
export async function computeDHashYRGB(source,size=8){
  const w=size,h=size+1; const id=getImageData(source,0,0,w,h); const {R,G,B}=splitRGB(id);
  function ch(v){let bits=0,k=0; for(let y=0;y<size;y++) for(let x=0;x<w;x++,k++){const a=v[y*w+x],b=v[(y+1)*w+x]; if(a>b) bits|=(1<<k)} return bits>>>0;}
  return {r:ch(R),g:ch(G),b:ch(B)};
}

export function detectGridCrops(img,{padFrac=0.07,minGap=4,debug=false}={}){
  const W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
  const s=Math.min(W,H), pad=Math.floor(s*padFrac);
  const x0=((W-s)/2|0)+pad, y0=((H-s)/2|0)+pad;
  const S=s-2*pad, cell=(S-minGap*4)/5, gap=minGap;
  const boxes=[];
  for(let r=0;r<5;r++) for(let c=0;c<5;c++){
    const x=Math.round(x0+c*(cell+gap)), y=Math.round(y0+r*(cell+gap));
    const w=Math.round(cell), h=Math.round(cell);
    boxes.push({x,y,w,h});
  }
  const crops=boxes.map(b=>getImageData(img,b.x,b.y,b.w,b.h));
  if(debug){window.__bingo_boxes=boxes}
  return crops;
}
