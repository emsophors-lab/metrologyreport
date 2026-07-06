const CACHE_NAME = 'nmc-report-pwa-v9';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Pre-cache error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Keep API and third-party database calls uncached and secure
  if (
    url.hostname.includes('supabase') || 
    url.pathname.includes('/api/') || 
    url.pathname.includes('/rest/') || 
    url.pathname.includes('auth') ||
    url.pathname.toLowerCase().includes('history') ||
    url.pathname.toLowerCase().includes('report') ||
    url.pathname.toLowerCase().includes('user') ||
    url.pathname.toLowerCase().includes('export') ||
    url.search.toLowerCase().includes('history') ||
    url.search.toLowerCase().includes('report') ||
    url.search.toLowerCase().includes('user') ||
    url.search.toLowerCase().includes('export') ||
    url.pathname.toLowerCase().endsWith('.pdf') ||
    url.pathname.toLowerCase().endsWith('.doc') ||
    url.pathname.toLowerCase().endsWith('.docx')
  ) {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
              cache.put('/index.html', responseToCache.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Only cache common static local resources
  const isStaticResource = 
    url.pathname === '/manifest.webmanifest' ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|json|webmanifest)$/i.test(url.pathname);

  if (!isStaticResource) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('SW Match Fail:', err);
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
