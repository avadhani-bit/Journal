/* Journal — Service Worker v1 */
const CACHE = 'journal-v1';
const PRECACHE = [
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept Firebase, Google auth, or third-party requests
  if (
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('accounts.google.com') ||
    url.includes('firestore.googleapis.com') ||
    e.request.method !== 'GET'
  ) return;

  // Page navigations: network-first so fresh deploys show up right away,
  // fall back to the cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put('./index.html', res.clone()));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // App shell assets: network-first, cache as an offline fallback.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
