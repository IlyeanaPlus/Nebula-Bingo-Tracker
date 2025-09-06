// src/utils/match.js
export function findBestMatch(sig,cache,ABS_THRESH=8){
  let best=null,score=1e9;
  for(const it of cache){
    const a=it.ahash??it.ah, x=it.dhashX??it.dx, y=it.dhashY??it.dy;
    if(a==null||x==null||y==null) continue;
    const s = popcnt(sig.ah^a) + popcnt(sig.dx^x) + popcnt(sig.dy^y);
    if(s<score){score=s;best=it}
  }
  return (best && score<=ABS_THRESH)?{name:best.name,id:best.id||best.name,score}:null;
}
function popcnt(n){n=n>>>0;let c=0;while(n){n&=n-1;c++}return c}
