// Network first for the app itself so updates show right away; cached copy when offline.
const CACHE='phrase1000-v11';
const CORE=['./','index.html','manifest.webmanifest','apple-touch-icon-parrot.png','icon-192-parrot.png','icon-512-parrot.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const own=r.url.startsWith(self.location.origin);
  // always ask the server for our own files (skip the 10-minute browser cache) so updates arrive right away
  e.respondWith(fetch(r,own?{cache:'no-cache'}:{}).then(res=>{
    if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}
    return res;
  }).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
});
