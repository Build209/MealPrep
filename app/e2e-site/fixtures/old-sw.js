/* eslint-disable no-restricted-globals */
/**
 * TEST FIXTURE: a stand-in for the OLD app's service worker (mobile/public/sw.js), served at /sw.js
 * by serve-pages.mjs in "old" mode. It keeps what matters for the clean-up test:
 *   - scope "/" (set by the page that registers it, as the old pwa-register.js did);
 *   - install precaches into a "meal-prep-shell-<version>-<policy>" cache, then skipWaiting;
 *   - activate deletes other meal-prep-shell-* caches and claims open pages;
 *   - a fetch handler that answers same-origin GETs (navigations network-first with the cached
 *     shell as fallback, hashed assets cache-first, the rest stale-while-revalidate);
 *   - the SKIP_WAITING message.
 * Differences from the real file: the version and precache list are fixed here (the real ones
 * were injected at export time by mobile/scripts/apply-pwa-export.mjs), and the precache list is
 * two files that exist in the new site.
 */
const CACHE_VERSION = 'e2e';
const PRECACHE_URLS = ['/', '/terms.html'];
const NAV_POLICY_VERSION = '7';
const SHELL_CACHE = `meal-prep-shell-${CACHE_VERSION}-${NAV_POLICY_VERSION}`;

const SUPABASE_HOST_RE = /(^|\.)supabase\.co$/i;

function isAuthLikeRequest(url, request) {
  if (SUPABASE_HOST_RE.test(url.hostname)) return true;
  const path = url.pathname.toLowerCase();
  if (path.includes('/auth/') || path.includes('token')) return true;
  if (request.credentials === 'include' && request.method !== 'GET') return true;
  return false;
}

function cachedAppShell() {
  return caches.match(new URL('index.html', self.registration.scope).pathname).then(
    (hit) => hit || caches.match(new URL('./', self.registration.scope).pathname),
  );
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}

function networkFirst(request, offlineFallback) {
  return fetch(request, { cache: 'no-store' })
    .catch(() => fetch(request))
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || (offlineFallback && offlineFallback())));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).then(() => true, () => false))))
      .then((results) => (results.every(Boolean) ? self.skipWaiting() : caches.delete(SHELL_CACHE))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('meal-prep-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAuthLikeRequest(url, request)) return;
  if (url.pathname.startsWith('/__e2e__/sw-mode')) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request, cachedAppShell));
    return;
  }
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/pwa-register.js')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes('/_expo/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
