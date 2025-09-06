export function findBestMatch(sig,cache,{ABS_LUMA=8,ABS_RGB=20,COLOR_W=0.5}={}){
  let best=null,score=1e9;
  for(const it of cache){
    const a=it.ahash??it.ah, x=it.dhashX??it.dx, y=it.dhashY??it.dy;
    if(a==null||x==null||y==null) continue;
    const sL=pop(a^sig.ah)+pop(x^sig.dx)+pop(y^sig.dy);
    let total=sL+9999;
    if(hasRGB(it)&&sig.ahRGB){
      const sC=pop((it.ahashR??it.ahr)^sig.ahRGB.r)+
        pop((it.ahashG??it.ahg)^sig.ahRGB.g)+
        pop((it.ahashB??it.ahb)^sig.ahRGB.b)+
        pop((it.dhashXR??it.dxr)^sig.dxRGB.r)+
        pop((it.dhashXG??it.dxg)^sig.dxRGB.g)+
        pop((it.dhashXB??it.dxb)^sig.dxRGB.b)+
        pop((it.dhashYR??it.dyr)^sig.dyRGB.r)+
        pop((it.dhashYG??it.dyg)^sig.dyRGB.g)+
        pop((it.dhashYB??it.dyb)^sig.dyRGB.b);
      if(sC<=ABS_RGB) total=sL+COLOR_W*sC;
    }
    if(total<score){score=total;best=it}
  }
  if(!best) return null;
  const sLum=pop((best.ahash??best.ah)^sig.ah)+pop((best.dhashX??best.dx)^sig.dx)+pop((best.dhashY??best.dy)^sig.dy);
  if(sLum>ABS_LUMA) return null;
  return {name:best.name,id:best.id||best.name,score:Math.round(score)};
}
function hasRGB(o){return ["ahashR","ahashG","ahashB","dhashXR","dhashXG","dhashXB","dhashYR","dhashYG","dhashYB"].every(k=>o[k]!=null)}
function pop(n){n=n>>>0;let c=0;while(n){n&=n-1;c++}return c}
