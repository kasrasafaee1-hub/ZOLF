// Cache-first shell so the app opens with no signal in a gym basement.
const CACHE = 'zolf-lift-v1';
const ASSETS = [
  '../index.html',
  '../src/ui/tokens-zolf.css',
  '../src/ui/styles.css',
  '../src/ui/app.js',
  '../src/ui/dom.js',
  '../src/core/store.js',
  '../src/core/profile.js',
  '../src/core/profiles.js',
  '../src/core/programs-amore.js',
  '../src/core/rotation.js',
  '../src/core/calendar.js',
  '../src/core/supplements.js',
  '../src/core/programs.js',
  '../src/core/training.js',
  '../src/core/nutrition.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new URL(a, self.location).pathname))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(new URL('../index.html', self.location).pathname))
    )
  );
});
