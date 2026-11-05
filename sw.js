// Network first for the app itself so updates show right away; cached copy when offline.
const CACHE='meemory-v123';
const CORE=['./','index.html','manifest.webmanifest','apple-touch-icon.png','icon-192.png','icon-512.png','mascot.png','mascot-silver.png','mascot-gold.png','mascot-bone.png','acc-pumpkin.png','mascot-robot.png','mascot-zombie.png','mascot-sakura.png','mascot-galaxy.png','mascot-macho.png','mascot-macho-silver.png','mascot-macho-gold.png','mascot-ice.png','mascot-lava.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const own=r.url.startsWith(self.location.origin);
  // other sites (database, login, AI) go straight to the network, never answered from the cache
  if(!own&&!r.url.includes('fonts.g'))return;
  // always ask the server for our own files (skip the 10-minute browser cache) so updates arrive right away
  e.respondWith(fetch(r,own?{cache:'no-cache'}:{}).then(res=>{
    if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}
    return res;
  }).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
});
