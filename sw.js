const CACHE = 'hisaabmitra-v30';
const SHELL = ['./', './index.html', './style.css', './app.js', './i18n.js', './i18n-dict.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App files: pehle network, offline ho to cache. Supabase ka data kabhi cache nahi hota.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  // Apni files hamesha server se check karo (browser ka purana cache nahi), taaki update turant aaye
  const req = url.origin === location.origin ? fetch(url.href, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(
    req.then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
