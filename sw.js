/* EMBERFALL offline cache — registered only when served over http/https.
   Strategy: the app shell (index.html, ./) is NETWORK-FIRST with the cache
   as offline fallback, so updates ship immediately; everything else is
   cache-first with background refresh. */
const CACHE = 'emberfall-v4.4';
const CORE = ['./', './index.html', './js/audio.js', './js/sky.js', './js/net.js', './js/art.js', './js/input.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/michroma-400.woff2', './fonts/chakra-petch-400.woff2', './fonts/chakra-petch-500.woff2',
  './fonts/chakra-petch-600.woff2', './fonts/chakra-petch-700.woff2'];

self.addEventListener('install', e => {
  /* cache:'reload' — precache fetches BYPASS the browser HTTP cache. Without
     it, an install inherits whatever stale hour-old entry the page's HTTP
     cache still holds, and the "new" SW ships old modules forever. */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  /* the API is live data — sessions, boards, profiles must never be cached */
  if (url.pathname.startsWith('/api/')) return;
  const isShell = url.pathname === '/' || url.pathname.endsWith('/index.html');
  e.respondWith(
    (isShell
      ? fetch(e.request).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        }).catch(() => caches.match(e.request, { ignoreSearch: true }))
          .then(hit => hit || caches.match('./'))
      : caches.match(e.request, { ignoreSearch: true }).then(hit => {
          /* stale-while-revalidate: the cached copy answers instantly, the
             network refreshes it behind the response — module fixes reach
             players on their next load without a SW version bump */
          const net = fetch(e.request, { cache: 'no-cache' }).then(res => {   // revalidate, never trust the HTTP cache
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(e.request, copy));
            }
            return res;
          }).catch(() => null);
          return hit || net.then(r => r || Response.error());
        })
    ).catch(() => fetch(e.request))
  );
});
