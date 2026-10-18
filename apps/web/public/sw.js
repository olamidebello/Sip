const CACHE="olamide-shell-v2";
const SHELL=["/offline.html","/icon-192.png","/icon-512.png","/manifest.webmanifest"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data={};
    try{data=event.data?.json()||{};}catch{}
    const incoming=data.kind==='incoming_call' && Number(data.expiresAt)>Date.now();
    await self.registration.showNotification(incoming?'Incoming Olamide call':'Olamide call notification',{
      body:incoming?'Tap to open your softphone and answer.':'Open Olamide to check your calls.',
      icon:'/icon-192.png',badge:'/icon-192.png',
      tag:typeof data.callId==='string'?'call-'+data.callId.slice(0,128):'olamide-call',
      requireInteraction:incoming,data:{url:'/'},
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(item=>new URL(item.url).origin===self.location.origin);
    if(client){await client.focus();client.postMessage({type:'OLAMIDE_CALL_WAKE'});return;}
    await self.clients.openWindow('/');
  })());
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

