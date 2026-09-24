/* Chitthi service worker: works offline after the first visit. */
const APP_CACHE = 'chitthi-app-v4';
const FONT_CACHE = 'chitthi-fonts-v1';
const CORE = ['./', 'index.html', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/healthz') return;
    // Pages: network first so updates arrive, cache when offline.
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req)
          .then((res) => { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put('index.html', copy)); return res; })
          .catch(() => caches.match('index.html'))
      );
      return;
    }
    // Static files (hashed by Vite, so safe to keep): cache first.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Google Fonts: serve from cache, refresh in the background.
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
