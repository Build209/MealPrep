/* eslint-disable no-restricted-globals */
/**
 * Clean-up service worker. The new app has no service worker.
 *
 * The old app (mobile/) registered /sw.js with scope "/" on every browser that opened it, and
 * cached files in "meal-prep-shell-*" caches. Browsers check /sw.js for updates on their own,
 * so serving this file at the same address replaces the old worker. On activation it deletes
 * the old caches, unregisters itself and reloads open tabs once, so they load the new app
 * straight from the network.
 *
 * (not verified on a real browser with the old SW installed)
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('meal-prep-shell-')).map((key) => caches.delete(key)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
          if ('navigate' in client) client.navigate(client.url).catch(() => {});
        });
      } catch (e) {
        /* ignore */
      }
    })(),
  );
});

// No fetch handler: every request goes straight to the network.
