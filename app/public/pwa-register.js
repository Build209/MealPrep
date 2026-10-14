/**
 * Clean-up for the old app's service worker. The new app does not load this file.
 *
 * A page the old app cached may still ask for /pwa-register.js. Instead of registering a
 * worker, this removes any that are left and their "meal-prep-shell-*" caches.
 *
 * (not verified on a real browser with the old SW installed)
 */
(function removeOldServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .getRegistrations()
    .then(function (registrations) {
      registrations.forEach(function (registration) {
        registration.unregister();
      });
    })
    .catch(function () {
      /* ignore */
    });
  if (window.caches && caches.keys) {
    caches
      .keys()
      .then(function (keys) {
        keys.forEach(function (key) {
          if (key.indexOf('meal-prep-shell-') === 0) caches.delete(key);
        });
      })
      .catch(function () {
        /* ignore */
      });
  }
})();
