// sw.js — oPLUS LMS v20.03
const CACHE = 'oplus-lms-v20.05';
const ASSETS = [
  '/oplus-lms-dev/',
  '/oplus-lms-dev/index.html',
  '/oplus-lms-dev/globals.js',
  '/oplus-lms-dev/utils.js',
  '/oplus-lms-dev/pa.js',
  '/oplus-lms-dev/reports.js',
  '/oplus-lms-dev/admin.js',
  '/oplus-lms-dev/app.js',
  '/oplus-lms-dev/manifest.json',
  '/oplus-lms-dev/catalogue.json',
  '/oplus-lms-dev/panels.json',
  '/oplus-lms-dev/preanalytical.json',
  '/oplus-lms-dev/doctors.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS.map(function(url) {
        return new Request(url, { cache: 'reload' });
      })).catch(function(err) {
        console.warn('SW install partial:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
