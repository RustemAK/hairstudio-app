// HairStudio PWA Service Worker
const CACHE_NAME = 'hairstudio-cache-v28';
// NOTE: HTML references files with ?v= query strings for browser cache busting.
// The fetch handler uses network-first and auto-updates the SW cache on success.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './book.html',
  './admin.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/supabase-sync.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only cache same-origin requests; skip Supabase API and external services
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Navigation requests: Network first, fallback to cached index.html or book.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          if (event.request.url.includes('book.html')) {
            return caches.match('./book.html');
          }
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Assets: Network first, fallback to cache (guarantees fresh updates when online, full offline support)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request, { ignoreSearch: true });
      })
  );
});
