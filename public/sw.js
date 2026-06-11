// Minimal hand-rolled service worker (no Workbox — keep deps minimal).
// Caches only the static app shell. NEVER caches /api/* responses: Google's
// Places policy forbids storing price data, and prices must stay fresh.
const CACHE = 'gasmath-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST /api/* etc. pass straight through

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third parties (incl. Google) untouched
  if (url.pathname.startsWith('/api/')) return; // network-only; never cache price data

  // Navigations: network-first so a redeploy can't serve stale HTML that points
  // at hashed assets which no longer exist; fall back to cache when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/'))),
    );
    return;
  }

  // Other same-origin assets (hashed JS/CSS, icons): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
