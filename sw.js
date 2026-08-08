/* ==========================================================================
   Farasa service worker

   The entire site is static and procedural — everything regenerates from
   the same three files. Cache them and the site works fully offline.
   ========================================================================== */

const CACHE_NAME = 'farasa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/renderer.js',
  '/js/app.js',
  'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..112,400..800&family=JetBrains+Mono:wght@400;500;700&display=swap',
];

// Install: cache everything
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
