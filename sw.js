/*
 * Push-only worker. It does not cache pages and it does not unregister
 * itself or any other registration. The customer app registers it for the
 * site folder and VIP Admin registers it for the admin/ folder.
 */
self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

var orderPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function siteRoot() {
  return new URL("./", self.location.href);
}

function adminHome() {
  return new URL("admin/", siteRoot());
}

// The first admin build registered this worker with the file scope admin.html.
function isAdminRegistration() {
  var scope = self.registration.scope;
  return scope === adminHome().href || scope === new URL("admin.html", siteRoot()).href;
}

// link_path comes from notification_outbox: "admin.html?order=<uuid>#pending"
// or "orders.html?order=<uuid>". Only the order id is taken from it, and each
// app opens only its own screen.
function allowedTarget(linkPath) {
  if (!linkPath || typeof linkPath !== "string") {
    return "";
  }
  if (linkPath.indexOf("://") !== -1 || linkPath.indexOf("//") === 0) {
    return "";
  }
  var url;
  try {
    url = new URL(linkPath, siteRoot());
  } catch (error) {
    return "";
  }
  if (url.origin !== self.location.origin) {
    return "";
  }
  var order = url.searchParams.get("order") || "";
  if (!orderPattern.test(order)) {
    return "";
  }
  var file = url.pathname.split("/").pop();
  var safe;
  if (isAdminRegistration()) {
    if (file !== "admin.html" && url.pathname !== adminHome().pathname) {
      return "";
    }
    safe = adminHome();
    safe.searchParams.set("order", order);
    return safe.href;
  }
  if (file !== "orders.html") {
    return "";
  }
  safe = new URL("orders.html", siteRoot());
  safe.searchParams.set("order", order);
  return safe.href;
}

function belongsToApp(clientUrl) {
  var url;
  try {
    url = new URL(clientUrl);
  } catch (error) {
    return false;
  }
  if (url.origin !== self.location.origin) {
    return false;
  }
  var admin = url.pathname.indexOf(adminHome().pathname) === 0 || url.pathname === new URL("admin.html", siteRoot()).pathname;
  if (isAdminRegistration()) {
    return admin;
  }
  return !admin && url.pathname.indexOf(siteRoot().pathname) === 0;
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
  if (!target) {
    target = isAdminRegistration() ? adminHome().href : new URL("orders.html", siteRoot()).href;
  }
  event.waitUntil(self.registration.showNotification(title.slice(0, 80), {
    body: body.slice(0, 180),
    lang: "he",
    dir: "rtl",
    data: { url: target }
  }));
});

function openTarget(target) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
    var index;
    var existing = null;
    for (index = 0; index < windowClients.length; index += 1) {
      if (belongsToApp(windowClients[index].url)) {
        existing = windowClients[index];
        if (existing.focused) {
          break;
        }
      }
    }
    if (!existing) {
      return self.clients.openWindow(target);
    }
    var focused = typeof existing.focus === "function" ? existing.focus() : Promise.resolve(existing);
    return Promise.resolve(focused).then(function (client) {
      var active = client || existing;
      if (active.url === target || typeof active.navigate !== "function") {
        if (typeof active.postMessage === "function") {
          active.postMessage({ type: "vip-open-order", url: target });
        }
        return active;
      }
      return active.navigate(target).then(function (navigated) {
        return navigated || self.clients.openWindow(target);
      });
    }).catch(function () {
      return self.clients.openWindow(target);
    });
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var stored = event.notification.data && event.notification.data.url;
  var target = typeof stored === "string" && stored.indexOf(self.location.origin + "/") === 0 ? stored : "";
  if (!target) {
    target = isAdminRegistration() ? adminHome().href : new URL("orders.html", siteRoot()).href;
  }
  event.waitUntil(openTarget(target));
});
