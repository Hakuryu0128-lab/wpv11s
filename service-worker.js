const CACHE_NAME = 'weeky-v11.1.1';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=11.1.1',
  './app.js?v=11.1.1',
  './manifest.webmanifest',
  './vendor/jspdf.umd.min.js',
  './vendor/html2canvas.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* NETWORK-FIRST strategy.
   Always try the network first so updated files propagate immediately.
   Fall back to cache only when offline. This prevents the stale-cache
   problem where an old index.html keeps loading an old app.js. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Never cache cross-origin requests (e.g. weather API)
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(async () => {
        // オフライン：まず同じURLのキャッシュ、無ければ画面遷移はindex.htmlへ
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});

/* Allow the page to tell the SW to activate immediately */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
