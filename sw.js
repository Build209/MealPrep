/* eslint-disable no-restricted-globals */
/**
 * App-shell service worker for MealPlanatic (GitHub Pages subpath).
 * Cache version and precache list are injected at export time by scripts/apply-pwa-export.mjs.
 */
const CACHE_VERSION = 'aaeac777789d';
const PRECACHE_URLS = [
  "/(tabs)/index.html",
  "/_expo/static/css/web-e3873b2496a5bd8a67d9eb687446ee88.css",
  "/_expo/static/js/web/__common-50207b28e4195fb5419049e252e02f2e.js",
  "/_expo/static/js/web/__expo-metro-runtime-1f8f5d3ca6b7f58204d51e14506d73fb.js",
  "/_expo/static/js/web/_layout-1e269450cd93d5b6e611154718ecf6c6.js",
  "/_expo/static/js/web/_layout-25025202162eaaa170d6c790de973f7d.js",
  "/_expo/static/js/web/entry-10c2ae3a8e8b031f80092ccc01f6ae17.js",
  "/_expo/static/js/web/index-e716a4f19e70f69bdc941e0b2b498c41.js",
  "/favicon.ico",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/index.html",
  "/manifest.webmanifest"
];
/** Bumped when navigation caching policy changes (forces fresh shell cache). */
const NAV_POLICY_VERSION = '7';
const SHELL_CACHE = `meal-prep-shell-${CACHE_VERSION}-${NAV_POLICY_VERSION}`;

const SUPABASE_HOST_RE = /(^|\.)supabase\.co$/i;

function isSupabaseRequest(url) {
  return SUPABASE_HOST_RE.test(url.hostname);
}

function isAuthLikeRequest(url, request) {
  if (isSupabaseRequest(url)) return true;
  const path = url.pathname.toLowerCase();
  if (path.includes('/auth/') || path.includes('token')) return true;
  if (request.credentials === 'include' && request.method !== 'GET') return true;
  return false;
}

function appShellUrl() {
  return new URL('index.html', self.registration.scope).pathname;
}

function cachedAppShell() {
  const indexPath = appShellUrl();
  return caches.match(indexPath);
}

function isImmutableHashedAsset(pathname) {
  return pathname.includes('/_expo/static/');
}

function isSwBootstrapAsset(pathname) {
  return pathname.endsWith('/sw.js') || pathname.endsWith('/pwa-register.js');
}

function isShellHtmlRequest(pathname) {
  return pathname === appShellUrl() || pathname.endsWith('/index.html');
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

/**
 * Ask the server, not the browser's own HTTP cache. GitHub Pages lets browsers keep a page for
 * ten minutes, which showed people the previous version of the app right after an update.
 * If a browser refuses the no-store request, the ordinary request still runs.
 */
function fetchFresh(request) {
  return fetch(request, { cache: 'no-store' }).catch(() => fetch(request));
}

function networkFirst(request, offlineFallback) {
  return fetchFresh(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return offlineFallback?.();
      }),
    );
}

function precacheUrl(url) {
  return caches.open(SHELL_CACHE).then((cache) =>
    cache.add(url).then(
      () => true,
      () => false,
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all(PRECACHE_URLS.map((url) => precacheUrl(url))).then((results) => {
      const allOk = results.every(Boolean);
      if (!allOk) {
        return caches.delete(SHELL_CACHE);
      }
      return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('meal-prep-shell-') && key !== SHELL_CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAuthLikeRequest(url, request)) return;

  if (request.mode === 'navigate' || isShellHtmlRequest(url.pathname)) {
    event.respondWith(networkFirst(request, cachedAppShell));
    return;
  }

  if (isSwBootstrapAsset(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableHashedAsset(url.pathname)) {
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
      return cached ?? networkFetch;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
