const CACHE="olamide-shell-v1";
const SHELL=["/offline.html","/icon-192.png","/icon-512.png","/manifest.webmanifest"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if (request.method!=="GET") return;
  const url=new URL(request.url);
  if (url.origin!==self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode==="navigate") {
    event.respondWith(fetch(request).catch(()=>caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const cached=await cache.match(request);
      const network=fetch(request).then(response=>{
        if (response.ok) cache.put(request,response.clone());
        return response;
      }).catch(()=>cached);
      return cached||network;
    }));
  }
});
