export async function tryLoadDriveCacheJSON(){
  try{
    const r=await fetch("/drive_cache.json",{cache:"reload"});
    if(!r.ok) throw 0;
    const j=await r.json();
    return j.map(x=>({
      id:x.id??x.name,
      name:x.name??x.title??String(x.id),
      ahash:x.ahash??x.ah,
      dhashX:x.dhashX??x.dx,
      dhashY:x.dhashY??x.dy,
      ahashR:x.ahashR,ahashG:x.ahashG,ahashB:x.ahashB,
      dhashXR:x.dhashXR,dhashXG:x.dhashXG,dhashXB:x.dhashXB,
      dhashYR:x.dhashYR,dhashYG:x.dhashYG,dhashYB:x.dhashYB
    }));
  }catch{ return [] }
}
