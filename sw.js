// sw.js — oPLUS LMS v20.05
const CACHE = 'oplus-lms-v20.05';

// Core shell files — must succeed for app to work
const CORE = [
  '/oplus-lms-dev/',
  '/oplus-lms-dev/index.html',
  '/oplus-lms-dev/globals.js',
  '/oplus-lms-dev/utils.js',
  '/oplus-lms-dev/pa.js',
  '/oplus-lms-dev/reports.js',
  '/oplus-lms-dev/admin.js',
  '/oplus-lms-dev/app.js',
  '/oplus-lms-dev/manifest.json',
];
// Large data files — cached opportunistically, won't block install
const DATA = [
  '/oplus-lms-dev/catalogue.json',
  '/oplus-lms-dev/panels.json',
  '/oplus-lms-dev/preanalytical.json',
  '/oplus-lms-dev/doctors.json',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // Cache core files — these must succeed
      return cache.addAll(CORE.map(function(url) {
        return new Request(url, { cache: 'reload' });
      })).then(function() {
        // Cache data files opportunistically — failures don't block install
        return Promise.allSettled(DATA.map(function(url) {
          return cache.add(new Request(url, { cache: 'reload' }));
        }));
      });
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

  // Network-first: always try network, fall back to cache
  // This ensures updates are always picked up when online
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      // Offline fallback — serve from cache
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        // If navigating and no cache — return index.html shell
        if (e.request.mode === 'navigate') return caches.match('/oplus-lms-dev/index.html');
      });
    })
  );
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
