/*
 * Push-only worker. It does not cache pages and it does not unregister
 * itself or any other registration. Customer and admin each keep their own
 * registration of this file, with different scopes.
 */
self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function appDirectory() {
  var scope = new URL(self.registration.scope);
  var path = scope.pathname;
  if (path.charAt(path.length - 1) !== "/") {
    path = path.slice(0, path.lastIndexOf("/") + 1);
  }
  return new URL(path, scope.origin);
}

function allowedTarget(linkPath) {
  if (!linkPath || typeof linkPath !== "string") {
    return "";
  }
  if (linkPath.indexOf("://") !== -1 || linkPath.indexOf("//") === 0) {
    return "";
  }
  var url;
  try {
    url = new URL(linkPath, appDirectory());
  } catch (error) {
    return "";
  }
  if (url.origin !== self.location.origin) {
    return "";
  }
  var file = url.pathname.split("/").pop();
  if (file !== "admin.html" && file !== "orders.html") {
    return "";
  }
  var order = url.searchParams.get("order") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order)) {
    return "";
  }
  var safe = new URL(file, appDirectory());
  safe.searchParams.set("order", order);
  if (file === "admin.html" && url.hash === "#pending") {
    safe.hash = "pending";
  }
  return safe.href;
}

self.addEventListener("push", function (event) {
  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = {};
    }
  }
  var title = payload && typeof payload.title === "string" && payload.title ? payload.title : "VIP";
  var body = payload && typeof payload.body === "string" ? payload.body : "";
  var target = allowedTarget(payload && payload.url);
  event.waitUntil(self.registration.showNotification(title.slice(0, 80), {
    body: body.slice(0, 180),
    lang: "he",
    dir: "rtl",
    data: { url: target }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = allowedTarget(event.notification.data && event.notification.data.url);
  if (!target) {
    return;
  }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
    var index;
    for (index = 0; index < windowClients.length; index += 1) {
      var client = windowClients[index];
      var current = client.url ? client.url.split("#")[0] : "";
      if (current === target.split("#")[0] && typeof client.focus === "function") {
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(target);
    }
    return undefined;
  }));
});
