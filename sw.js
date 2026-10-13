const CACHE = 'hisaabmitra-v60';
const SHELL = ['./', './index.html', './style.css', './app.js', './i18n.js', './i18n-dict.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './logo.svg'];
// Bahar ki files jo app ko chahiye (Supabase library, fonts) — ye bhi phone me rakhte hain
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Tez kholna: pehle phone me rakhi file turant do, peeche se nayi le ke rakh lo (agli baar ke liye).
// Supabase ka data (API) kabhi cache nahi hota.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  const same = url.origin === location.origin;
  if (!same && !CDN.test(req.url)) return;
  // Main page: pehle internet (naya version turant), 2.5 sec me na mile to phone wala
  if (same && req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true }) || await cache.match('./index.html');
      const net = fetch(new Request(req.url, { cache: 'no-cache' })).then(res => { if (res.ok) cache.put('./index.html', res.clone()); return res; });
      const timeout = new Promise(r => setTimeout(() => r(hit), 2500));
      return (hit ? Promise.race([net.catch(() => hit), timeout]) : net).then(r => r || net);
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(same ? new Request(req.url, { cache: 'no-cache' }) : req)
      .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
      .catch(() => hit);
    return hit || net;
  }));
});
