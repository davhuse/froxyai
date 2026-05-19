// Service Worker v193 - network-first, safe clone
const CACHE = 'froxy-v193';

self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  
  // Only handle same-origin GET requests for static files
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/generated/')) return;
  
  // Only cache HTML/CSS/JS/images
  if (!/\.(html|css|js|png|jpg|svg|webp|json)$/.test(url.pathname) && url.pathname !== '/') return;
  
  e.respondWith(
    fetch(req).then(networkRes => {
      // Clone BEFORE consuming the response body
      if (networkRes && networkRes.ok && networkRes.type === 'basic') {
        const cloneForCache = networkRes.clone();
        caches.open(CACHE).then(c => c.put(req, cloneForCache)).catch(() => {});
      }
      return networkRes;
    }).catch(() => caches.match(req))
  );
});


