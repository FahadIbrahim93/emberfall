/* EMBERFALL offline cache — registered only when served over http/https.
   Strategy: the app shell (index.html, ./) is NETWORK-FIRST with the cache
   as offline fallback, so updates ship immediately; everything else is
   cache-first with background refresh. */
const CACHE = 'emberfall-v3.2.1';
const CORE = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
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
      : caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
          fetch(e.request).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(e.request, copy));
            }
            return res;
          })
        )
    ).catch(() => fetch(e.request))
  );
});
