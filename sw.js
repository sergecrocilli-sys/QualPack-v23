const CACHE_NAME = 'qualpack-v23-2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './db.js',
  './sync.js',
  './pdf-v2.js',
  './fonts.css',
  './jspdf.umd.min.js',
  './xlsx.full.min.js',
  './lignes.js',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        for (const asset of APP_SHELL) {
          try {
            await cache.add(asset);
          } catch (err) {
            console.warn('SW cache skip:', asset, err);
          }
        }
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('SW install failed:', error);
      })
  );
});

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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorer tout ce qui n'est pas http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Navigation HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', responseClone).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Même origine : cache first puis réseau
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((response) => {
          if (
            response &&
            response.status === 200 &&
            request.method === 'GET' &&
            (url.protocol === 'http:' || url.protocol === 'https:')
          ) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Origine externe : réseau puis cache si possible
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          request.method === 'GET' &&
          (url.protocol === 'http:' || url.protocol === 'https:')
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
