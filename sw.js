/*
 * The previous worker stayed in control after refresh and kept serving
 * saved pages that do not load js/supabase-client.js.
 * Activate once, delete those saved pages, drop the registration, and
 * reload the open tabs so the local server answers the next request.
 */
self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      return self.clients.matchAll({ type: "window" });
    }).then(function (windowClients) {
      return Promise.all(windowClients.map(function (client) {
        if (client.url && client.navigate) {
          return client.navigate(client.url);
        }
        return undefined;
      }));
    })
  );
});
