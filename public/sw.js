const CACHE="nebula-bingo-v2";
const ASSETS=["/","/index.html","/drive_cache.json"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))) .then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  e.respondWith(
    caches.match(req).then(cached=>cached||fetch(req).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>{ if(req.method==="GET" && (req.url.startsWith(self.location.origin))) c.put(req,copy) });
      return r;
    }).catch(()=>cached))
  );
});
