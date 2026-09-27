// Offline support: serve cached files instantly, refresh them in the background.
// Bump VERSION whenever you want every player to drop their old cache.
const VERSION = 'v1';
const CORE = ['./', 'index.html', 'crossing.html', 'manifest.webmanifest', 'data/harvard.json',
  'src/crossing.js', 'src/game/main.js', 'src/game/world.js', 'src/game/landmarks.js', 'src/game/traffic.js',
  'src/game/models.js', 'src/game/audio.js', 'src/game/util.js', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || !(url.startsWith(self.location.origin) || CDN.test(url))) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: url.startsWith(self.location.origin) });
    const fresh = fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
