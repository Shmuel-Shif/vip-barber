var CACHE_NAME = "vip-shell-v97";
var SHELL = [
  "./index.html",
  "./booking.html",
  "./booking-next.html",
  "./booking-details.html",
  "./booking-summary.html",
  "./booking-wait.html",
  "./admin.html",
  "./orders.html",
  "./style.css",
  "./script.js",
  "./js/demo-data.js",
  "./js/supabase-client.js",
  "./js/admin.js",
  "./manifest.webmanifest",
  "./assets/tools.jpg",
  "./assets/logo/logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") {
    return;
  }

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request.url, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow"
    }).then(function (response) {
      if (response && response.ok && response.type === "basic" && !url.pathname.endsWith("/sw.js")) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.put(request.url, copy);
        });
      }
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) {
          return cached;
        }
        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return Response.error();
      });
    })
  );
});
