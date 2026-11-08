// SH✡MER Nature is not public yet: this worker clears its old cache and removes itself.
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/^shomer-nature-v\d+$/.test(k)).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.matchAll({type:'window'})).then(cs=>cs.forEach(c=>c.navigate(c.url).catch(()=>{}))));});
