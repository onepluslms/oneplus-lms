// LabFlow Service Worker — v19.55
const CACHE_NAME = 'labflow-v19.87';

const PRECACHE = [
  '/oneplus-lms/index.html',
  '/oneplus-lms/manifest.json',
  '/oneplus-lms/icon-192.png',
  '/oneplus-lms/icon-512.png',
  '/oneplus-lms/doctors.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache core files — doctors.json may not exist yet, don't fail if missing
      return cache.addAll([
        '/oneplus-lms/index.html',
        '/oneplus-lms/manifest.json',
        '/oneplus-lms/icon-192.png',
        '/oneplus-lms/icon-512.png',
      ]).then(() => {
        // Cache doctors.json separately — optional, won't block install
        return cache.add('/oneplus-lms/doctors.json').catch(() => {
          console.log('SW: doctors.json not yet available — will cache on first fetch');
        });
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('gstatic.com')) return;
  if (url.hostname.includes('firebaseio.com')) return;

  // Network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Listen for skip waiting message from app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
