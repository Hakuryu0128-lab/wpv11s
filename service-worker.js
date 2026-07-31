const CACHE_NAME = 'weeky-v11.21.2';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=11.21.2',
  './app.js?v=11.21.2',
  './manifest.webmanifest',
  './vendor/pdf-lib.min.js',
  './vendor/fontkit.umd.min.js',
  './vendor/NotoSansJP-Regular.otf',
  './vendor/NotoSansJP-Bold.otf',
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
   problem where an old index.html keeps loading an old app.js.
   v11.3.1：fetch(e.request)だけだとブラウザの「HTTP cache」を経由してしまい、
   GitHub PagesがCache-Control: max-age=600を返すindex.html等は、直近10分以内に
   一度でも読み込んでいると「ネットワークに問い合わせたつもり」でも実際は端末の
   HTTPキャッシュから古いバイト列が返ってきてしまう不具合があった（ユーザー報告：
   「アップデートが降りてこない」）。fetch(url, {cache:'no-store'})に変更し、
   HTTPキャッシュそのものを迂回して常にネットワークから生のバイト列を取得する
   よう修正。オンラインである限り、これで確実に最新版に更新される。 */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Never cache cross-origin requests (e.g. weather API)
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request.url, { cache: 'no-store' })
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
