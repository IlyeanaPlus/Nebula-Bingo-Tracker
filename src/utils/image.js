// src/utils/image.js
export async function loadImageFromFile(file){
  const blob = file instanceof Blob ? file : new Blob([file]);
  const bitmap = await createImageBitmap(blob);
  return bitmap; // ImageBitmap
}

function toCanvas(src, sx=0, sy=0, sw=src.width, sh=src.height, dw=sw, dh=sh){
  const c = document.createElement("canvas");
  c.width = dw; c.height = dh;
  const g = c.getContext("2d", {alpha:false, willReadFrequently:true});
  // drawImage accepts ImageBitmap | HTMLImageElement | HTMLCanvasElement
  g.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  return c;
}

// Very stable 5×5 grid crops. If you want auto-detect, we can add it back,
// but this avoids type issues and works for the standard screenshot layout.
export function detectGridCrops(image,{padFrac=0.07}={}){
  const W=image.width, H=image.height;
  const padX=W*padFrac, padY=H*padFrac;
  const innerX=padX, innerY=padY, innerW=W-2*padX, innerH=H-2*padY;
  const cellW=innerW/5, cellH=innerH/5;
  const out=[];
  for(let r=0;r<5;r++){
    for(let c=0;c<5;c++){
      const sx=Math.round(innerX + c*cellW);
      const sy=Math.round(innerY + r*cellH);
      const sw=Math.round(cellW), sh=Math.round(cellH);
      out.push(toCanvas(image, sx, sy, sw, sh, 32, 32)); // normalize size for hashing
    }
  }
  return out; // Array<HTMLCanvasElement>
}

async function toImageData(src, w, h){
  const cv = src instanceof HTMLCanvasElement ? src : toCanvas(src, 0,0, src.width, src.height, w, h);
  const g = cv.getContext("2d", {alpha:false, willReadFrequently:true});
  return g.getImageData(0,0,cv.width,cv.height);
}

export async function computeAHash(src){
  const SIZE=8;
  const id=await toImageData(src,SIZE,SIZE);
  const data=id.data, w=SIZE, h=SIZE;
  // grayscale aHash
  let sum=0; const gray=new Array(w*h);
  for(let i=0,j=0;i<data.length;i+=4,j++){ const g=(data[i]*299 + data[i+1]*587 + data[i+2]*114)/1000|0; gray[j]=g; sum+=g; }
  const avg=sum/(w*h); let bits=0n;
  for(let i=0;i<gray.length;i++) if(gray[i]>=avg) bits|=1n<<BigInt(i);
  return Number(bits & 0xffffffffn);
}

export async function computeDHashX(src){
  const W=9, H=8;
  const id=await toImageData(src,W,H);
  const d=id.data; let out=0, k=0;
  const gy=(i)=>((d[i]*299 + d[i+1]*587 + d[i+2]*114)/1000|0);
  for(let y=0;y<H;y++){
    for(let x=0;x<W-1;x++,k++){
      const i1=(y*W + x)*4, i2=(y*W + x + 1)*4;
      if(gy(i1)>gy(i2)) out|=(1<<k);
    }
  }
  return out>>>0;
}

export async function computeDHashY(src){
  const W=8, H=9;
  const id=await toImageData(src,W,H);
  const d=id.data; let out=0, k=0;
  const gy=(i)=>((d[i]*299 + d[i+1]*587 + d[i+2]*114)/1000|0);
  for(let y=0;y<H-1;y++){
    for(let x=0;x<W;x++,k++){
      const i1=(y*W + x)*4, i2=((y+1)*W + x)*4;
      if(gy(i1)>gy(i2)) out|=(1<<k);
    }
  }
  return out>>>0;
}
