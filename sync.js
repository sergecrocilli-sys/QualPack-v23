const CACHE_NAME = 'qualpack-v22-1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './db.js',
  './sync.js',
  './pdf-v2.js',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './jspdf.umd.min.js',
  './xlsx.full.min.js',
  './libs/jspdf.umd.min.js',
  './libs/xlsx.full.min.js',
  './logo-codex.jpg',
  './picto-codex.jpg',
  './assets/logo-codex.jpg',
  './assets/picto-codex.jpg',
  './fonts.css',
  './assets/fonts/fonts.css'
];

// Installation : pré-cache uniquement des fichiers locaux essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('SW install failed:', error);
      })
  );
});

// Activation : suppression des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1) Navigation HTML : network first, fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', responseClone);
          });
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2) Assets locaux : cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((response) => {
          if (
            response &&
            response.status === 200 &&
            request.method === 'GET'
          ) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 3) Ressources externes : network first, fallback cache si déjà présent
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          request.method === 'GET'
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
