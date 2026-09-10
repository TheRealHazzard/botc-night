// Bump this whenever a deploy should force clients to drop their old
// cached shell — activate() below deletes any cache under this name.
const CACHE_NAME = 'botc-shell-v1';

// Real-time and mutating traffic must always hit the network, never the
// cache — the vote/action endpoints, and the two live SSE streams.
const NEVER_CACHE = [/^\/api\//, /^\/events/, /^\/host-events/, /^\/sim-events/];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (NEVER_CACHE.some(rx => rx.test(url.pathname))) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      }).catch(() => cached || (event.request.mode === 'navigate' ? caches.match('/') : undefined));
      return cached || network;
    })
  );
});
