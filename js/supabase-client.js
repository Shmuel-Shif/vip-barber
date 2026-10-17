/*
 * Browser client only. The key is the publishable key, not the service_role key and not a password.
 * connected stays false until a real Supabase request has been confirmed.
 * This file does not read or delete local orders.
 *
 * window.VIP_SUPABASE is assigned before any network call, so the object exists
 * as soon as this file has run, even if the CDN library is still loading.
 */
(function () {
  "use strict";

  var url = "https://riyiypsuwlnpsycobnpw.supabase.co";
  var publishableKey = "sb_publishable_96PIIh6eTsAh9KXV4aHhSA_Kqwb67V2";
  var client = null;
  var ordersWatch = {
    generation: 0,
    channel: null,
    timer: null,
    pending: null,
    handler: null,
    busy: false,
    again: false,
    stopped: true
  };

  function clearOrdersTimer() {
    if (ordersWatch.timer) {
      window.clearInterval(ordersWatch.timer);
      ordersWatch.timer = null;
    }
    if (ordersWatch.pending) {
      window.clearTimeout(ordersWatch.pending);
      ordersWatch.pending = null;
    }
  }

  function pokeOrdersWatch() {
    if (ordersWatch.stopped || typeof ordersWatch.handler !== "function") {
      return;
    }
    if (ordersWatch.pending) {
      window.clearTimeout(ordersWatch.pending);
    }
    ordersWatch.pending = window.setTimeout(function () {
      ordersWatch.pending = null;
      if (ordersWatch.stopped || typeof ordersWatch.handler !== "function") {
        return;
      }
      if (ordersWatch.busy) {
        ordersWatch.again = true;
        return;
      }
      ordersWatch.busy = true;
      Promise.resolve().then(ordersWatch.handler).catch(function () {
        return null;
      }).then(function () {
        ordersWatch.busy = false;
        if (ordersWatch.again && !ordersWatch.stopped) {
          ordersWatch.again = false;
          pokeOrdersWatch();
        }
      });
    }, 400);
  }

  function ensureOrdersPoll(generation) {
    if (ordersWatch.stopped || generation !== ordersWatch.generation || ordersWatch.timer) {
      return;
    }
    ordersWatch.timer = window.setInterval(pokeOrdersWatch, 60000);
  }

  function usableToken(session) {
    var expiresAt = session && session.expires_at ? Number(session.expires_at) * 1000 : 0;
    if (!session || !session.access_token || !expiresAt || expiresAt <= Date.now() + 20000) {
      return "";
    }
    return session.access_token;
  }

  function freshToken(ready) {
    return ready.auth.getSession().then(function (result) {
      var session = result && result.data ? result.data.session : null;
      var token = usableToken(session);
      if (token) {
        return token;
      }
      if (!session || !session.refresh_token || !ready.auth.refreshSession) {
        return "";
      }
      return ready.auth.refreshSession().then(function (refreshed) {
        var next = refreshed && refreshed.data ? refreshed.data.session : null;
        return usableToken(next);
      }).catch(function () {
        return "";
      });
    });
  }

  function applyRealtimeAuth(ready) {
    if (!ready.realtime || typeof ready.realtime.setAuth !== "function") {
      return Promise.resolve();
    }
    try {
      var result = ready.realtime.setAuth();
      if (result && typeof result.then === "function") {
        return result.then(function () {
          return null;
        }).catch(function () {
          return null;
        });
      }
    } catch (error) {
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  var clientPromise = null;
  // Customer pages share one saved session per device. VIP Admin keeps its own key.
  var customerStorageKey = "sb-riyiypsuwlnpsycobnpw-customer-auth";
  var adminStorageKey = "sb-riyiypsuwlnpsycobnpw-admin-auth";

  function isAdminPage() {
    return !!(document.body && document.body.classList.contains("admin"));
  }

  // Earlier builds kept the customer session per tab in sessionStorage. Move this
  // tab's session to device storage once, only when the device has none yet, then
  // drop the tab copy so it is never read again.
  function adoptTabSession() {
    var tabId = "";
    var tabKey = "";
    var saved = "";
    try {
      tabId = window.sessionStorage.getItem("vip-customer-tab") || "";
      tabKey = tabId ? "sb-riyiypsuwlnpsycobnpw-tab-" + tabId : "";
      saved = tabKey ? window.sessionStorage.getItem(tabKey) || "" : "";
      if (saved && !window.localStorage.getItem(customerStorageKey)) {
        window.localStorage.setItem(customerStorageKey, saved);
      }
    } catch (error) {
      saved = "";
    }
    try {
      if (tabKey) {
        window.sessionStorage.removeItem(tabKey);
      }
      window.sessionStorage.removeItem("vip-customer-tab");
      window.sessionStorage.removeItem("vip-customer-tab-handoff");
    } catch (error) {
      tabKey = "";
    }
  }

  function authOptions() {
    return {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: isAdminPage() ? adminStorageKey : customerStorageKey
    };
  }

  function libraryReady() {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var waited = 0;
      var timer = window.setInterval(function () {
        waited += 50;
        if ((window.supabase && typeof window.supabase.createClient === "function") || waited >= 8000) {
          window.clearInterval(timer);
          resolve(!!(window.supabase && typeof window.supabase.createClient === "function"));
        }
      }, 50);
    });
  }

  function openClient() {
    if (client) {
      return Promise.resolve(client);
    }
    if (!clientPromise) {
      clientPromise = libraryReady().then(function (ready) {
        if (!ready) {
          return null;
        }
        if (!isAdminPage()) {
          adoptTabSession();
        }
        return window.supabase.createClient(url, publishableKey, {
          auth: authOptions()
        });
      }).then(function (created) {
        client = created || null;
        api.client = client;
        return client;
      }).catch(function () {
        clientPromise = null;
        client = null;
        api.client = null;
        return null;
      });
    }
    return clientPromise;
  }

  function classify(error) {
    var message = error && error.message ? String(error.message) : "Unknown error";
    var code = error && (error.code || error.status) ? String(error.code || error.status) : "";
    var text = (code + " " + message).toLowerCase();
    var kind = "unknown";
    if (/failed to fetch|network|timeout|load failed|503|502|504/.test(text)) {
      kind = "connection";
    } else if (/quota|exceed|too many|rate limit|429|402/.test(text)) {
      kind = "quota";
    } else if (/permission|42501|401|403|jwt|row-level security|unauthorized/.test(text)) {
      kind = "permission";
    }
    return { kind: kind, message: message };
  }

  function checkConnection() {
    return openClient().then(function (ready) {
      if (!ready) {
        api.connected = false;
        api.lastCheck = classify({ message: "Supabase library is not on the page." });
        return api.lastCheck;
      }
      return ready.from("services").select("id").limit(1).then(function (result) {
        if (result.error || !Array.isArray(result.data)) {
          api.connected = false;
          api.lastCheck = classify(result.error || { message: "Services did not return a list." });
        } else {
          api.connected = true;
          api.lastCheck = { kind: "ok", message: "" };
        }
        return api.lastCheck;
      }).catch(function (error) {
        api.connected = false;
        api.lastCheck = classify(error);
        return api.lastCheck;
      });
    });
  }

  function whenReady() {
    return openClient();
  }

  function messageFor(error) {
    var raw = error && error.message ? String(error.message) : (typeof error === "string" ? error : "");
    var text = raw.toLowerCase();
    if (!raw) {
      return "הפעולה נכשלה.";
    }
    if (text.indexOf("username taken") !== -1) {
      return "שם המשתמש תפוס. אפשר להתחבר.";
    }
    if (text.indexOf("invalid username") !== -1) {
      return "השם באנגלית בלבד, אותיות ומספרים";
    }
    if (text.indexOf("invalid login") !== -1 || text.indexOf("invalid credentials") !== -1) {
      return "האימייל או הסיסמה לא נכונים.";
    }
    if (text.indexOf("already registered") !== -1 || text.indexOf("already been registered") !== -1) {
      return "כבר יש חשבון עם האימייל הזה. אפשר להתחבר.";
    }
    if (text.indexOf("email not confirmed") !== -1) {
      return "צריך לאשר את האימייל לפני ההתחברות.";
    }
    if (text.indexOf("password") !== -1 && (text.indexOf("least") !== -1 || text.indexOf("short") !== -1 || text.indexOf("weak") !== -1)) {
      return "הסיסמה צריכה 6 תווים לפחות.";
    }
    if (text.indexOf("signups not allowed") !== -1 || (text.indexOf("signup") !== -1 && text.indexOf("disabled") !== -1)) {
      return "ההרשמה סגורה כרגע.";
    }
    if (text.indexOf("authentication required") !== -1) {
      return "צריך להתחבר לפני שליחת ההזמנה.";
    }
    if (text.indexOf("profile missing") !== -1) {
      return "החשבון עדיין לא מוכן. נסו להתחבר שוב.";
    }
    if (text.indexOf("booking window is still open") !== -1) {
      return "הזמן להזמנה עדיין פתוח.";
    }
    if (text.indexOf("service durations are not configured") !== -1) {
      return "משך השירות אינו מוגדר כרגע.";
    }
    if (text.indexOf("hold expired") !== -1) {
      return "עברו 10 הדקות להזמנה. בחרו שעה מחדש.";
    }
    if (text.indexOf("hold does not match") !== -1) {
      return "השעה שנבחרה לא תואמת. בחרו שעה מחדש.";
    }
    if (text.indexOf("party too large") !== -1) {
      return "לקבוצה של יותר מחמישה אנשים זאבי מתאם אישית. אפשר לפנות בטלפון או בוואטסאפ.";
    }
    if (text.indexOf("time already taken") !== -1 || text.indexOf("travel gap too small") !== -1) {
      return "השעה הזו כבר אינה זמינה. בחרו שעה אחרת.";
    }
    if (text.indexOf("outside the open booking week") !== -1) {
      return "התאריך מחוץ לשבוע הפתוח להזמנה.";
    }
    if (text.indexOf("outside open hours") !== -1) {
      return "השעה מחוץ לשעות הפעילות.";
    }
    if (text.indexOf("overlaps a break") !== -1 || text.indexOf("blocked") !== -1) {
      return "השעה הזו חסומה.";
    }
    if (text === "closed") {
      return "היום סגור.";
    }
    if (text.indexOf("invalid appointment") !== -1) {
      return "פרטי ההזמנה לא תקינים.";
    }
    if (text.indexOf("invalid hours") !== -1 || text.indexOf("invalid break") !== -1 || text.indexOf("invalid block") !== -1) {
      return "השעות לא תקינות. צריך התחלה, סיום, והפסקות או חסימות בתוך הטווח.";
    }
    if (text.indexOf("invalid range") !== -1) {
      return "טווח התאריכים לזמינות לא תקין.";
    }
    if (text.indexOf("admin only") !== -1 || text.indexOf("row-level security") !== -1 || text.indexOf("permission denied") !== -1) {
      return "הפעולה הזו שמורה לחשבון האדמין.";
    }
    if (text.indexOf("failed to fetch") !== -1 || text.indexOf("network") !== -1 || text.indexOf("load failed") !== -1) {
      return "אין חיבור כרגע. נסו שוב בעוד רגע.";
    }
    if (text.indexOf("customer cannot change") !== -1) {
      return "אי אפשר לבטל החל מ־7 שעות לפני התור.";
    }
    if (text.indexOf("order not found") !== -1) {
      return "ההזמנה לא נמצאה בחשבון.";
    }
    if (text.indexOf("more than 7") !== -1 || text.indexOf("7 hours") !== -1) {
      return "אי אפשר לבטל החל מ־7 שעות לפני התור.";
    }
    if (window.console && typeof window.console.error === "function") {
      window.console.error(raw);
    }
    return "לא הצלחנו להשלים את הפעולה. נסו שוב בעוד רגע.";
  }

  function windowResult(result) {
    var row = result && result.data && result.data[0] ? result.data[0] : null;
    if (result && result.error) {
      return { expiresAt: "", serverNow: "", expired: false, error: messageFor(result.error) };
    }
    if (!row || !row.expires_at) {
      return { expiresAt: "", serverNow: "", expired: true, error: "" };
    }
    return {
      expiresAt: row.expires_at,
      serverNow: row.server_now || "",
      expired: row.is_expired === true,
      error: ""
    };
  }

  function normalizeUsername(value) {
    var name = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(name)) {
      return "";
    }
    return name;
  }

  function internalEmail(username) {
    return username + "@login.vip-barber.invalid";
  }

  // Auth email is not always the same as profiles.username.
  // zeevi770 is the admin profile, but that Auth user is still zeevi@...
  // The zeevi770@... address belongs to a different, non-admin user.
  function authEmailForUsername(username) {
    if (username === "zeevi770") {
      return internalEmail("zeevi");
    }
    return internalEmail(username);
  }

  function usernameAuthError(error) {
    var text = messageFor(error);
    if (text === "האימייל או הסיסמה לא נכונים.") {
      return "שם המשתמש או הסיסמה לא נכונים.";
    }
    if (text === "כבר יש חשבון עם האימייל הזה. אפשר להתחבר.") {
      return "שם המשתמש תפוס. אפשר להתחבר.";
    }
    return text;
  }

  function withClient(task) {
    return whenReady().then(function (ready) {
      if (!ready) {
        return { data: null, error: "אין חיבור." };
      }
      return task(ready);
    });
  }

  function currentSession() {
    return withClient(function (ready) {
      return ready.auth.getSession().then(function (result) {
        if (result.error) {
          return { session: null, error: messageFor(result.error) };
        }
        return { session: result.data && result.data.session ? result.data.session : null, error: "" };
      });
    });
  }

  var profileDetailColumns = "first_name, last_name, address, photo_path";

  function missingColumn(error) {
    var code = String((error && error.code) || "");
    return code === "42703" || code === "PGRST204" || /does not exist|could not find/i.test(String((error && error.message) || ""));
  }

  function currentProfile() {
    return currentSession().then(function (result) {
      if (!result.session || !client) {
        return { profile: null, session: result.session, error: result.error };
      }
      var base = "role, full_name, phone, username";
      function load(columns) {
        return client.from("profiles").select(columns).eq("id", result.session.user.id).maybeSingle();
      }
      var first = isAdminPage() ? load(base) : load(base + ", " + profileDetailColumns);
      return first.then(function (profileResult) {
        // Until 0016 runs, the detail columns do not exist. Role checks must still work.
        if (profileResult.error && !isAdminPage() && missingColumn(profileResult.error)) {
          return load(base);
        }
        return profileResult;
      }).then(function (profileResult) {
        if (profileResult.error) {
          return { profile: null, session: result.session, error: messageFor(profileResult.error) };
        }
        return { profile: profileResult.data, session: result.session, error: "" };
      });
    });
  }

  var adminOnCustomerPage = "החשבון המחובר הוא חשבון מנהל. מכאן אי אפשר לבצע פעולת לקוח.";

  function blockAdminCustomer(empty) {
    if (document.body && document.body.classList.contains("admin")) {
      return Promise.resolve(null);
    }
    return currentProfile().then(function (loaded) {
      if (loaded && loaded.profile && loaded.profile.role === "admin") {
        return empty;
      }
      return null;
    });
  }

  var addressParts = {
    city: "city",
    street: "street",
    houseNumber: "house_number",
    entrance: "entrance",
    floor: "floor",
    apartment: "apartment",
    entryCode: "entry_code"
  };

  function mapProfile(row) {
    var source = row && row.address && typeof row.address === "object" ? row.address : {};
    var address = {};
    Object.keys(addressParts).forEach(function (key) {
      address[key] = typeof source[addressParts[key]] === "string" ? source[addressParts[key]] : "";
    });
    return {
      username: row && row.username ? String(row.username) : "",
      fullName: row && row.full_name ? String(row.full_name) : "",
      firstName: row && row.first_name ? String(row.first_name) : "",
      lastName: row && row.last_name ? String(row.last_name) : "",
      phone: row && row.phone ? String(row.phone) : "",
      address: address,
      photoPath: row && row.photo_path ? String(row.photo_path) : ""
    };
  }

  // Only the keys present in fields are written, so a partial save keeps the rest.
  function profileRow(fields) {
    var row = {};
    function text(value) {
      var clean = String(value || "").trim();
      return clean ? clean : null;
    }
    if ("firstName" in fields) {
      row.first_name = text(fields.firstName);
    }
    if ("lastName" in fields) {
      row.last_name = text(fields.lastName);
    }
    if ("phone" in fields) {
      row.phone = text(fields.phone);
    }
    if (fields.address && typeof fields.address === "object") {
      var address = {};
      Object.keys(addressParts).forEach(function (key) {
        var value = text(fields.address[key]);
        if (value) {
          address[addressParts[key]] = value;
        }
      });
      row.address = Object.keys(address).length ? address : null;
    }
    return row;
  }

  function profileError(error) {
    var text = String((error && error.message) || "");
    if (missingColumn(error)) {
      return "הפרופיל עדיין לא זמין. נסו שוב מאוחר יותר.";
    }
    if (/invalid profile|check constraint|violates/i.test(text)) {
      return "חלק מהפרטים ארוכים מדי או לא תקינים.";
    }
    return messageFor(error);
  }

  function randomHex(size) {
    var bytes = new Uint8Array(size);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) {
      return (value < 16 ? "0" : "") + value.toString(16);
    }).join("");
  }

  var entranceBucket = "entrance-photos";
  var entranceFailed = "לא הצלחנו להעלות את תמונת הכניסה. נסו שוב, או חזרו לשלב הקודם והסירו את התמונה כדי לשלוח בלי תמונה.";
  var entranceUpload = null;
  var entranceUrls = {};

  function jpegBlob(dataUrl) {
    var match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!match) {
      return null;
    }
    try {
      var binary = window.atob(match[1]);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: "image/jpeg" });
    } catch (error) {
      return null;
    }
  }

  // Until 0018 runs there is no bucket and no stage_order_photo; orders go out without the photo, as before.
  function entranceSetupMissing(error) {
    var code = String((error && error.code) || "");
    var text = String((error && (error.message || error.error)) || "");
    return code === "PGRST202" || code === "42883" || /bucket not found|could not find the function/i.test(text);
  }

  function mapOrder(row) {
    var time = row && row.appointment_time ? String(row.appointment_time) : "";
    if (time.length >= 5) {
      time = time.slice(0, 5);
    }
    return {
      id: row.id,
      customerId: row.customer_id || "",
      server: true,
      status: row.status || "pending",
      adults: row.adults || 0,
      children: row.children || 0,
      beards: row.beards || 0,
      vip: 0,
      date: row.appointment_date || "",
      time: time,
      prices: {
        adults: typeof row.adult_price_ils === "number" ? row.adult_price_ils : null,
        children: typeof row.child_price_ils === "number" ? row.child_price_ils : null,
        beards: typeof row.beard_price_ils === "number" ? row.beard_price_ils : null
      },
      photo: "",
      photoPath: row.photo_path ? String(row.photo_path) : "",
      customer: {
        fullName: row.full_name || "",
        phone: row.phone || "",
        city: row.city || "",
        street: row.street || "",
        houseNumber: row.house_number || "",
        entrance: row.entrance || "",
        floor: row.floor || "",
        apartment: row.apartment || "",
        entryCode: row.entry_code || "",
        notes: row.notes || "",
        payment: row.payment || ""
      }
    };
  }

  // Customer pages live in the site folder; VIP Admin lives in its own admin/
  // folder so each installed app has a scope that does not cover the other's start page.
  function siteRoot() {
    return new URL(isAdminPage() ? "../" : "./", window.location.href);
  }

  function pushScope(audience) {
    var root = siteRoot();
    if (audience === "admin") {
      return new URL("admin/", root).href;
    }
    return root.href;
  }

  function legacyAdminScope() {
    return new URL("admin.html", siteRoot()).href;
  }

  function pushReadyKey(audience) {
    return audience === "admin" ? "vip-push-ready-admin" : "vip-push-ready-customer";
  }

  function clearPushReady(audience) {
    try {
      localStorage.removeItem(pushReadyKey(audience));
    } catch (error) {
      return;
    }
  }

  function markPushReady(audience) {
    try {
      localStorage.setItem(pushReadyKey(audience), "yes");
    } catch (error) {
      return;
    }
  }

  function currentPushRegistration(audience) {
    if (!navigator.serviceWorker || typeof navigator.serviceWorker.getRegistration !== "function") {
      return Promise.resolve(null);
    }
    var scope = pushScope(audience);
    // getRegistration() falls back to an outer scope, so only an exact match
    // belongs to this audience.
    return navigator.serviceWorker.getRegistration(scope).then(function (registration) {
      return registration && registration.scope === scope ? registration : null;
    }).catch(function () {
      return null;
    });
  }

  // The first VIP Admin build used the file scope admin.html. Its push
  // subscription is removed once the new admin/ subscription is saved, so the
  // admin does not get every notification twice. The registration itself stays.
  function retireLegacyAdminPush(ready) {
    if (!navigator.serviceWorker || typeof navigator.serviceWorker.getRegistration !== "function") {
      return Promise.resolve();
    }
    var scope = legacyAdminScope();
    return navigator.serviceWorker.getRegistration(scope).then(function (registration) {
      if (!registration || registration.scope !== scope || !registration.pushManager) {
        return null;
      }
      return registration.pushManager.getSubscription().then(function (subscription) {
        if (!subscription) {
          return null;
        }
        return ready.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint).eq("audience", "admin").then(function (removed) {
          if (removed && removed.error) {
            logPushFailure("legacy admin cleanup", removed.error);
          }
          return subscription.unsubscribe();
        });
      });
    }).catch(function (error) {
      logPushFailure("legacy admin cleanup", error);
      return null;
    });
  }

  function forgetPushSubscription(audience) {
    clearPushReady(audience);
    return currentPushRegistration(audience).then(function (registration) {
      if (!registration || !registration.pushManager) {
        return null;
      }
      return registration.pushManager.getSubscription().then(function (subscription) {
        if (!subscription) {
          return null;
        }
        var endpoint = subscription.endpoint;
        var removeRow = client
          ? client.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("audience", audience)
          : Promise.resolve({ error: null });
        return Promise.resolve(removeRow).then(function () {
          return subscription.unsubscribe();
        });
      });
    }).catch(function () {
      return null;
    });
  }

  // Logs only the error name/code and message, never the endpoint or keys.
  function logPushFailure(step, error) {
    if (window.console && typeof window.console.warn === "function") {
      var name = error && (error.code || error.name) ? String(error.code || error.name) : "Error";
      var message = error && error.message ? String(error.message) : String(error || "");
      window.console.warn("VIP push: " + step + " failed", name, message);
    }
  }

  function pushRejected(step, error) {
    if (step) {
      logPushFailure(step, error);
      return { ok: false, error: "ההרשמה נוצרה בדפדפן אבל לא נשמרה בשרת. נסו שוב." };
    }
    return { ok: false, error: "אי אפשר להפעיל התראות כרגע." };
  }

  var api = {
    connected: false,
    url: url,
    client: null,
    lastCheck: null,
    checkConnection: checkConnection,
    whenReady: whenReady,
    messageFor: messageFor,
    session: currentSession,
    profile: currentProfile,
    signUp: function (email, password) {
      return withClient(function (ready) {
        return ready.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        }).then(function (result) {
          if (result.error) {
            return { session: null, needsConfirm: false, error: messageFor(result.error) };
          }
          var session = result.data && result.data.session ? result.data.session : null;
          return { session: session, needsConfirm: !session, error: "" };
        });
      });
    },
    signIn: function (email, password) {
      return withClient(function (ready) {
        return ready.auth.signInWithPassword({
          email: email,
          password: password
        }).then(function (result) {
          if (result.error) {
            return { session: null, error: messageFor(result.error) };
          }
          return { session: result.data && result.data.session ? result.data.session : null, error: "" };
        });
      });
    },
    signUpWithUsername: function (username, password) {
      var name = normalizeUsername(username);
      if (!name) {
        return Promise.resolve({ session: null, needsConfirm: false, error: "השם באנגלית בלבד, אותיות ומספרים" });
      }
      return withClient(function (ready) {
        return ready.auth.signUp({
          email: internalEmail(name),
          password: password,
          options: {
            data: { username: name },
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        }).then(function (result) {
          if (result.error) {
            return { session: null, needsConfirm: false, error: usernameAuthError(result.error) };
          }
          var session = result.data && result.data.session ? result.data.session : null;
          return { session: session, needsConfirm: !session, error: "" };
        });
      });
    },
    signInWithUsername: function (username, password) {
      var name = normalizeUsername(username);
      if (!name) {
        return Promise.resolve({ session: null, error: "השם באנגלית בלבד, אותיות ומספרים" });
      }
      return withClient(function (ready) {
        return ready.auth.signInWithPassword({
          email: authEmailForUsername(name),
          password: password
        }).then(function (result) {
          if (result.error) {
            return { session: null, error: usernameAuthError(result.error) };
          }
          return { session: result.data && result.data.session ? result.data.session : null, error: "" };
        });
      });
    },
    signOut: function () {
      return withClient(function (ready) {
        var audience = isAdminPage() ? "admin" : "customer";
        return forgetPushSubscription(audience).then(function () {
          var signedOut = isAdminPage() ? ready.auth.signOut() : ready.auth.signOut({ scope: "local" });
          return signedOut.then(function () {
            return true;
          });
        });
      });
    },
    vapidPublicKey: function () {
      return fetch(url + "/functions/v1/vapid-public-key", {
        method: "GET",
        headers: { apikey: publishableKey }
      }).then(function (response) {
        if (!response.ok) {
          logPushFailure("vapid key", { name: "HTTP " + response.status, message: "vapid-public-key request failed" });
          return { publicKey: "", error: "אי אפשר להפעיל התראות כרגע." };
        }
        return response.json().then(function (body) {
          var key = body && typeof body.publicKey === "string" ? body.publicKey.trim() : "";
          if (!/^[A-Za-z0-9_-]{87}$/.test(key)) {
            logPushFailure("vapid key", { name: "InvalidKey", message: "public key has an unexpected format" });
            return { publicKey: "", error: "אי אפשר להפעיל התראות כרגע." };
          }
          return { publicKey: key, error: "" };
        });
      }).catch(function (error) {
        logPushFailure("vapid key", error);
        return { publicKey: "", error: "אי אפשר להפעיל התראות כרגע." };
      });
    },
    preparePushRegistration: function (audience) {
      if ((audience !== "admin" && audience !== "customer") || !navigator.serviceWorker) {
        return Promise.resolve(null);
      }
      if (audience === "admin" && !isAdminPage()) {
        return Promise.resolve(null);
      }
      if (audience === "customer" && isAdminPage()) {
        return Promise.resolve(null);
      }
      var script = new URL("sw.js", siteRoot()).href;
      return navigator.serviceWorker.register(script, { scope: pushScope(audience) }).then(function (registration) {
        var worker = registration.installing || registration.waiting;
        if (registration.active || !worker || worker.state === "activated") {
          return registration;
        }
        return new Promise(function (resolve) {
          var finished = false;
          function done() {
            if (finished) {
              return;
            }
            finished = true;
            resolve(registration);
          }
          worker.addEventListener("statechange", function () {
            if (worker.state === "activated" || worker.state === "redundant") {
              done();
            }
          });
          window.setTimeout(done, 4000);
        });
      }).catch(function (error) {
        logPushFailure("service worker", error);
        return null;
      });
    },
    savePushSubscription: function (audience, subscription) {
      var json = subscription && typeof subscription.toJSON === "function" ? subscription.toJSON() : null;
      var keys = json && json.keys ? json.keys : null;
      if ((audience !== "admin" && audience !== "customer") || !json || !json.endpoint || !keys || !keys.p256dh || !keys.auth) {
        return Promise.resolve(pushRejected());
      }
      if ((audience === "admin" && !isAdminPage()) || (audience === "customer" && isAdminPage())) {
        return Promise.resolve(pushRejected());
      }
      return withClient(function (ready) {
        function saved() {
          markPushReady(audience);
          var cleanup = audience === "admin" ? retireLegacyAdminPush(ready) : Promise.resolve();
          return cleanup.then(function () {
            return { ok: true, error: "" };
          });
        }
        return ready.auth.getSession().then(function (result) {
          var session = result && result.data ? result.data.session : null;
          if (!session || !session.user) {
            return { ok: false, error: "כדי להפעיל התראות צריך להתחבר." };
          }
          var row = {
            user_id: session.user.id,
            audience: audience,
            endpoint: json.endpoint,
            p256dh: keys.p256dh,
            auth_secret: keys.auth
          };
          return ready.from("push_subscriptions").select("id, audience").eq("endpoint", row.endpoint).maybeSingle().then(function (existing) {
            if (existing.error) {
              return pushRejected("save lookup", existing.error);
            }
            if (existing.data && existing.data.audience === audience) {
              return ready.from("push_subscriptions").update({
                p256dh: row.p256dh,
                auth_secret: row.auth_secret
              }).eq("id", existing.data.id).then(function (updated) {
                if (updated.error) {
                  return pushRejected("save update", updated.error);
                }
                return saved();
              });
            }
            var clear = existing.data
              ? ready.from("push_subscriptions").delete().eq("id", existing.data.id)
              : Promise.resolve({ error: null });
            return clear.then(function (removed) {
              if (removed && removed.error) {
                return pushRejected("save replace", removed.error);
              }
              return ready.from("push_subscriptions").insert(row).then(function (inserted) {
                if (inserted.error) {
                  var rejected = pushRejected("save insert", inserted.error);
                  // The endpoint is still stored for another account on this device.
                  rejected.conflict = inserted.error.code === "23505";
                  return rejected;
                }
                return saved();
              });
            });
          });
        });
      });
    },
    pushSubscription: function (audience) {
      if (audience !== "admin" && audience !== "customer") {
        return Promise.resolve(null);
      }
      return currentPushRegistration(audience).then(function (registration) {
        if (!registration || !registration.pushManager) {
          return null;
        }
        return registration.pushManager.getSubscription().then(function (subscription) {
          return subscription ? { registration: registration, subscription: subscription } : null;
        });
      }).catch(function (error) {
        logPushFailure("subscription lookup", error);
        return null;
      });
    },
    pushReady: function (audience) {
      try {
        return localStorage.getItem(pushReadyKey(audience)) === "yes";
      } catch (error) {
        return false;
      }
    },
    watchAuth: function (handler) {
      return withClient(function (ready) {
        var watched = ready.auth.onAuthStateChange(function (event, session) {
          handler(event, session || null);
        });
        return watched;
      });
    },
    requestAppointment: function (fields) {
      return blockAdminCustomer({ id: "", error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        var clock = String(fields.time || "");
        if (clock.length === 5) {
          clock = clock + ":00";
        }
        return ready.rpc("request_appointment", {
          p_adults: fields.adults,
          p_children: fields.children,
          p_beards: fields.beards,
          p_date: fields.date,
          p_time: clock,
          p_full_name: fields.fullName,
          p_phone: fields.phone,
          p_city: fields.city || "",
          p_street: fields.street || "",
          p_house_number: fields.houseNumber || "",
          p_entrance: fields.entrance || "",
          p_floor: fields.floor || "",
          p_apartment: fields.apartment || "",
          p_entry_code: fields.entryCode || "",
          p_notes: fields.notes || "",
          p_payment: fields.payment,
          p_hold: fields.holdId || null
        }).then(function (result) {
          if (result.error) {
            return { id: "", error: messageFor(result.error) };
          }
          return { id: result.data || "", error: "" };
        });
      });
      });
    },
    holdSlot: function (fields) {
      return blockAdminCustomer({ holdId: "", expiresAt: "", serverNow: "", error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        var clock = String(fields.time || "");
        if (clock.length === 5) {
          clock = clock + ":00";
        }
        return ready.rpc("hold_slot", {
          p_adults: fields.adults,
          p_children: fields.children,
          p_beards: fields.beards,
          p_date: fields.date,
          p_time: clock
        }).then(function (result) {
          var row = result.data && result.data[0] ? result.data[0] : null;
          if (result.error || !row || !row.hold_id || !row.expires_at) {
            return { holdId: "", expiresAt: "", serverNow: "", error: result.error ? messageFor(result.error) : "השעה לא נשמרה." };
          }
          return { holdId: row.hold_id, expiresAt: row.expires_at, serverNow: row.server_now || "", error: "" };
        });
      });
      });
    },
    currentHold: function () {
      return blockAdminCustomer({ hold: null, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        return ready.rpc("current_hold").then(function (result) {
          var row = result.data && result.data[0] ? result.data[0] : null;
          if (result.error) {
            return { hold: null, error: messageFor(result.error) };
          }
          if (!row || !row.hold_id) {
            return { hold: null, error: "" };
          }
          return {
            hold: {
              id: row.hold_id,
              date: String(row.appointment_date || "").slice(0, 10),
              time: String(row.appointment_time || "").slice(0, 5),
              adults: row.adults,
              children: row.children,
              beards: row.beards,
              expiresAt: row.expires_at,
              serverNow: row.server_now || ""
            },
            error: ""
          };
        });
      });
      });
    },
    releaseHold: function () {
      return blockAdminCustomer({ error: "" }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        return ready.rpc("release_my_hold").then(function (result) {
          if (!result.error) {
            return { error: "" };
          }
          var text = messageFor(result.error);
          if (text.indexOf("צריך להתחבר") !== -1) {
            return { error: "" };
          }
          return { error: text };
        });
      });
      });
    },
    fetchOrders: function () {
      return blockAdminCustomer({ rows: [], error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        var columns = "id, customer_id, status, adults, children, beards, appointment_date, appointment_time, full_name, phone, city, street, house_number, entrance, floor, apartment, entry_code, notes, payment, photo_path";
        function load(withPrices) {
          return ready.from("orders").select(withPrices ? columns + ", adult_price_ils, child_price_ils, beard_price_ils" : columns).order("created_at", { ascending: false });
        }
        return load(isAdminPage()).then(function (result) {
          // Until 0015 runs, the price columns do not exist (42703). The list still loads without them.
          if (result.error && isAdminPage() && (String(result.error.code || "") === "42703" || /_price_ils.*does not exist/.test(String(result.error.message || "")))) {
            return load(false);
          }
          return result;
        }).then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return {
            rows: (result.data || []).map(mapOrder),
            error: ""
          };
        });
      });
      });
    },
    orderAction: function (name, id) {
      return blockAdminCustomer({ error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        var wanted = name === "approve_order" ? "approved" : name === "reject_order" ? "rejected" : "";
        function serverState(status) {
          if (status === "approved") {
            return "מאושר";
          }
          if (status === "rejected") {
            return "נדחה";
          }
          if (status === "cancelled") {
            return "בוטל";
          }
          if (status === "pending") {
            return "ממתין";
          }
          return "";
        }
        function readStatus() {
          function once() {
            return ready.from("orders").select("status").eq("id", id).maybeSingle().then(function (result) {
              if (result && result.data && result.data.status) {
                return result.data.status;
              }
              if (result && result.error) {
                return freshToken(ready).then(function (token) {
                  if (!token) {
                    return "";
                  }
                  return ready.from("orders").select("status").eq("id", id).maybeSingle().then(function (again) {
                    return again && again.data && again.data.status ? again.data.status : "";
                  }).catch(function () {
                    return "";
                  });
                });
              }
              return "";
            }).catch(function () {
              return "";
            });
          }
          return once();
        }
        function finishFromServer(rpcError) {
          if (!wanted) {
            return { error: rpcError || "" };
          }
          return readStatus().then(function (status) {
            if (status === wanted) {
              return { error: "", status: status };
            }
            if (status === "pending") {
              return { error: rpcError || "הפעולה נכשלה.", status: status };
            }
            if (status) {
              var label = serverState(status);
              var lead = wanted === "approved" ? "לא הצלחנו לאשר את ההזמנה." : "לא הצלחנו לדחות את ההזמנה.";
              return { error: label ? lead + " המצב הנוכחי: " + label + "." : lead, status: status };
            }
            return { error: rpcError || "לא ניתן לאמת את תוצאת הפעולה. בדקו את רשימת ההזמנות.", status: "" };
          });
        }
        function send() {
          return ready.rpc(name, { p_id: id }).then(function (result) {
            if (result.error) {
              return finishFromServer(messageFor(result.error));
            }
            return finishFromServer("");
          }).catch(function () {
            return finishFromServer("הפעולה נכשלה.");
          });
        }
        if (!wanted) {
          return send();
        }
        return freshToken(ready).then(function (token) {
          if (!token) {
            return { error: "ההתחברות עדיין נטענת. נסו שוב בעוד רגע.", status: "" };
          }
          return send();
        });
      });
      });
    },
    deleteOrder: function (id) {
      return blockAdminCustomer({ deleted: false, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          function rowStillThere() {
            return ready.from("orders").select("id").eq("id", id).maybeSingle().then(function (result) {
              if (result && result.error) {
                return { error: messageFor(result.error), present: null };
              }
              return { error: "", present: !!(result && result.data && result.data.id) };
            }).catch(function () {
              return { error: "לא הצלחנו לאמת את המחיקה. נסו שוב בעוד רגע.", present: null };
            });
          }
          return freshToken(ready).then(function (token) {
            if (!token) {
              return { deleted: false, error: "ההתחברות עדיין נטענת. נסו שוב בעוד רגע." };
            }
            return ready.rpc("admin_delete_order", { p_id: id }).then(function (result) {
              var rpcError = result && result.error ? messageFor(result.error) : "";
              return rowStillThere().then(function (check) {
                if (check.error || check.present === null) {
                  return { deleted: false, error: check.error || rpcError || "לא הצלחנו לאמת את המחיקה. נסו שוב בעוד רגע." };
                }
                if (check.present) {
                  return { deleted: false, error: rpcError || "לא הצלחנו למחוק את התור. נסו שוב בעוד רגע." };
                }
                if (rpcError) {
                  return { deleted: false, gone: true, error: rpcError };
                }
                return { deleted: true, error: "" };
              });
            }).catch(function () {
              return { deleted: false, error: "לא הצלחנו למחוק את התור. נסו שוב בעוד רגע." };
            });
          });
        });
      });
    },
    hideOrder: function (id) {
      return blockAdminCustomer({ hidden: false, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return freshToken(ready).then(function (token) {
            if (!token) {
              return { hidden: false, error: "ההתחברות עדיין נטענת. נסו שוב בעוד רגע." };
            }
            return ready.rpc("admin_hide_order", { p_id: id }).then(function (result) {
              if (result && result.error) {
                return { hidden: false, error: messageFor(result.error) };
              }
              return { hidden: true, error: "" };
            }).catch(function () {
              return { hidden: false, error: "לא הצלחנו להסתיר את התור. נסו שוב בעוד רגע." };
            });
          });
        });
      });
    },
    unhideOrder: function (id) {
      return blockAdminCustomer({ shown: false, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return freshToken(ready).then(function (token) {
            if (!token) {
              return { shown: false, error: "ההתחברות עדיין נטענת. נסו שוב בעוד רגע." };
            }
            return ready.rpc("admin_unhide_order", { p_id: id }).then(function (result) {
              if (result && result.error) {
                return { shown: false, error: messageFor(result.error) };
              }
              return { shown: true, error: "" };
            }).catch(function () {
              return { shown: false, error: "לא הצלחנו להחזיר את התור. נסו שוב בעוד רגע." };
            });
          });
        });
      });
    },
    myProfile: function () {
      return blockAdminCustomer({ profile: null, signedIn: true, ready: false, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return currentProfile().then(function (loaded) {
          if (!loaded || !loaded.session) {
            return { profile: null, signedIn: false, ready: false, error: loaded && loaded.error ? loaded.error : "" };
          }
          var row = loaded.profile || {};
          return {
            profile: mapProfile(row),
            signedIn: true,
            ready: Object.prototype.hasOwnProperty.call(row, "first_name"),
            error: loaded.error || ""
          };
        });
      });
    },
    saveMyProfile: function (fields) {
      return blockAdminCustomer({ profile: null, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return ready.auth.getSession().then(function (result) {
            var session = result && result.data ? result.data.session : null;
            if (!session || !session.user) {
              return { profile: null, error: "כדי לשמור פרטים צריך להתחבר." };
            }
            var row = profileRow(fields || {});
            return ready.from("profiles").update(row).eq("id", session.user.id)
              .select("role, full_name, phone, username, " + profileDetailColumns).maybeSingle().then(function (saved) {
                if (saved.error) {
                  return { profile: null, error: profileError(saved.error) };
                }
                if (!saved.data) {
                  return { profile: null, error: "לא הצלחנו לשמור את הפרטים. נסו שוב בעוד רגע." };
                }
                return { profile: mapProfile(saved.data), error: "" };
              });
          });
        }).catch(function () {
          return { profile: null, error: "לא הצלחנו לשמור את הפרטים. נסו שוב בעוד רגע." };
        });
      });
    },
    uploadAvatar: function (blob, extension) {
      var ext = extension === "png" || extension === "webp" ? extension : "jpg";
      var types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
      return blockAdminCustomer({ path: "", error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return currentProfile().then(function (loaded) {
            if (!loaded || !loaded.session || !ready.storage) {
              return { path: "", error: "כדי להעלות תמונה צריך להתחבר." };
            }
            var previous = loaded.profile && loaded.profile.photo_path ? loaded.profile.photo_path : "";
            var path = loaded.session.user.id + "/avatar-" + randomHex(16) + "." + ext;
            var bucket = ready.storage.from("avatars");
            return bucket.upload(path, blob, { contentType: types[ext], upsert: false }).then(function (sent) {
              if (sent.error) {
                return { path: "", error: "לא הצלחנו להעלות את התמונה. נסו תמונה אחרת או נסו שוב." };
              }
              return ready.from("profiles").update({ photo_path: path }).eq("id", loaded.session.user.id).select("photo_path").maybeSingle().then(function (saved) {
                if (saved.error || !saved.data) {
                  return bucket.remove([path]).then(function () {
                    return { path: "", error: saved.error ? profileError(saved.error) : "לא הצלחנו לשמור את התמונה." };
                  });
                }
                if (previous && previous !== path) {
                  bucket.remove([previous]).catch(function () {
                    return null;
                  });
                }
                return { path: path, error: "" };
              });
            });
          });
        }).catch(function () {
          return { path: "", error: "לא הצלחנו להעלות את התמונה. נסו שוב בעוד רגע." };
        });
      });
    },
    removeAvatar: function () {
      return blockAdminCustomer({ error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return currentProfile().then(function (loaded) {
            if (!loaded || !loaded.session || !ready.storage) {
              return { error: "כדי להסיר תמונה צריך להתחבר." };
            }
            var previous = loaded.profile && loaded.profile.photo_path ? loaded.profile.photo_path : "";
            return ready.from("profiles").update({ photo_path: null }).eq("id", loaded.session.user.id).select("photo_path").maybeSingle().then(function (saved) {
              if (saved.error || !saved.data) {
                return { error: saved.error ? profileError(saved.error) : "לא הצלחנו להסיר את התמונה." };
              }
              if (previous) {
                return ready.storage.from("avatars").remove([previous]).then(function () {
                  return { error: "" };
                }).catch(function () {
                  return { error: "" };
                });
              }
              return { error: "" };
            });
          });
        }).catch(function () {
          return { error: "לא הצלחנו להסיר את התמונה. נסו שוב בעוד רגע." };
        });
      });
    },
    avatarUrl: function (path) {
      if (!path) {
        return Promise.resolve({ url: "", error: "" });
      }
      return withClient(function (ready) {
        if (!ready.storage) {
          return { url: "", error: "" };
        }
        return ready.storage.from("avatars").createSignedUrl(path, 3600).then(function (signed) {
          if (signed.error || !signed.data) {
            return { url: "", error: "לא הצלחנו להציג את התמונה." };
          }
          return { url: signed.data.signedUrl || signed.data.signedURL || "", error: "" };
        });
      }).catch(function () {
        return { url: "", error: "לא הצלחנו להציג את התמונה." };
      });
    },
    uploadEntrancePhoto: function (dataUrl, holdId) {
      var blob = jpegBlob(dataUrl);
      var hold = String(holdId || "").toLowerCase();
      if (isAdminPage() || !blob || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(hold)) {
        return Promise.resolve({ ok: false, path: "", error: entranceFailed });
      }
      return withClient(function (ready) {
        return ready.auth.getSession().then(function (result) {
          var session = result && result.data ? result.data.session : null;
          if (!session || !session.user || !ready.storage) {
            return { ok: false, path: "", error: "כדי לצרף תמונה צריך להתחבר." };
          }
          var user = session.user.id;
          var reuse = !!entranceUpload && entranceUpload.user === user && entranceUpload.hold === hold && entranceUpload.source === dataUrl;
          var path = reuse ? entranceUpload.path : user + "/" + hold + "/entrance-" + randomHex(16) + ".jpg";
          var sent = reuse
            ? Promise.resolve({ error: null })
            : ready.storage.from(entranceBucket).upload(path, blob, { contentType: "image/jpeg", upsert: false });
          return sent.then(function (uploaded) {
            if (uploaded.error) {
              return entranceSetupMissing(uploaded.error)
                ? { ok: false, unavailable: true, path: "", error: "" }
                : { ok: false, path: "", error: entranceFailed };
            }
            entranceUpload = { user: user, hold: hold, source: dataUrl, path: path };
            return ready.rpc("stage_order_photo", { p_hold: hold, p_path: path }).then(function (staged) {
              if (staged.error) {
                if (entranceSetupMissing(staged.error)) {
                  return { ok: false, unavailable: true, path: "", error: "" };
                }
                return {
                  ok: false,
                  path: "",
                  error: String(staged.error.message || "").indexOf("hold expired") !== -1 ? messageFor(staged.error) : entranceFailed
                };
              }
              return { ok: true, path: path, error: "" };
            });
          });
        });
      }).catch(function () {
        return { ok: false, path: "", error: entranceFailed };
      });
    },
    entrancePhotoUrl: function (path) {
      if (!isAdminPage() || !path) {
        return Promise.resolve({ url: "", error: "" });
      }
      var cached = entranceUrls[path];
      if (cached && cached.until > Date.now()) {
        return Promise.resolve({ url: cached.url, error: "" });
      }
      return withClient(function (ready) {
        if (!ready.storage) {
          return { url: "", error: "לא הצלחנו לטעון את התמונה." };
        }
        return ready.storage.from(entranceBucket).createSignedUrl(path, 600).then(function (signed) {
          var url = signed && !signed.error && signed.data ? signed.data.signedUrl || signed.data.signedURL || "" : "";
          if (!url) {
            return { url: "", error: "לא הצלחנו לטעון את התמונה." };
          }
          entranceUrls[path] = { url: url, until: Date.now() + 8 * 60 * 1000 };
          return { url: url, error: "" };
        });
      }).catch(function () {
        return { url: "", error: "לא הצלחנו לטעון את התמונה." };
      });
    },
    forgetEntrancePhotoUrl: function (path) {
      delete entranceUrls[path];
    },
    myVisitStats: function () {
      return blockAdminCustomer({ stats: null, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return ready.rpc("my_visit_stats").then(function (result) {
            if (result.error) {
              return { stats: null, unavailable: missingColumn(result.error), error: "לא הצלחנו לטעון את ההיסטוריה." };
            }
            var row = Array.isArray(result.data) ? result.data[0] : result.data;
            return {
              stats: {
                visits: row && row.visits ? Number(row.visits) : 0,
                mensHaircuts: row && row.mens_haircuts ? Number(row.mens_haircuts) : 0,
                kidsHaircuts: row && row.kids_haircuts ? Number(row.kids_haircuts) : 0,
                beards: row && row.beards ? Number(row.beards) : 0
              },
              error: ""
            };
          });
        }).catch(function () {
          return { stats: null, error: "לא הצלחנו לטעון את ההיסטוריה." };
        });
      });
    },
    // Read-only. profiles_select_own (0002) already lets only the admin see every row.
    registeredUsers: function () {
      if (!isAdminPage()) {
        return Promise.resolve({ users: [], error: "" });
      }
      var failed = "לא הצלחנו לטעון את רשימת הרשומים. נסו שוב בעוד רגע.";
      return withClient(function (ready) {
        function load(columns) {
          return ready.from("profiles").select(columns).eq("role", "customer").order("created_at", { ascending: false });
        }
        return load("id, username, full_name, first_name, last_name, phone, created_at").then(function (result) {
          return result.error && missingColumn(result.error) ? load("id, username, full_name, phone, created_at") : result;
        }).then(function (result) {
          if (result.error) {
            return { users: [], error: failed };
          }
          return {
            users: (result.data || []).map(function (row) {
              var name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.full_name || "";
              return {
                id: row.id,
                username: row.username || "",
                name: name,
                phone: row.phone || "",
                createdAt: row.created_at || ""
              };
            }),
            error: ""
          };
        });
      }).catch(function () {
        return { users: [], error: failed };
      });
    },
    visitOutcomes: function () {
      if (!isAdminPage()) {
        return Promise.resolve({ outcomes: {}, error: "" });
      }
      return withClient(function (ready) {
        return ready.from("visit_outcomes").select("order_id, outcome").then(function (result) {
          var outcomes = {};
          if (result.error) {
            return { outcomes: {}, unavailable: missingColumn(result.error) || String(result.error.code || "") === "42P01", error: messageFor(result.error) };
          }
          (result.data || []).forEach(function (row) {
            if (row && row.order_id) {
              outcomes[row.order_id] = row.outcome;
            }
          });
          return { outcomes: outcomes, error: "" };
        });
      }).catch(function () {
        return { outcomes: {}, error: "לא הצלחנו לטעון את סימוני הביקורים." };
      });
    },
    setVisitOutcome: function (id, outcome) {
      if (!isAdminPage()) {
        return Promise.resolve({ error: adminOnCustomerPage });
      }
      return withClient(function (ready) {
        return ready.rpc("set_visit_outcome", { p_id: id, p_outcome: outcome || null }).then(function (result) {
          if (!result.error) {
            return { outcome: result.data || "", error: "" };
          }
          var text = String(result.error.message || "");
          if (text.indexOf("visit not started") !== -1) {
            return { error: "אפשר לסמן ביקור רק אחרי שעת התור." };
          }
          if (text.indexOf("visit not approved") !== -1) {
            return { error: "אפשר לסמן רק תור מאושר." };
          }
          return { error: messageFor(result.error) };
        });
      }).catch(function () {
        return { error: "לא הצלחנו לשמור את הסימון. נסו שוב בעוד רגע." };
      });
    },
    hiddenOrderIds: function () {
      return blockAdminCustomer({ ids: [], error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return freshToken(ready).then(function (token) {
            if (!token) {
              return { ids: [], error: "ההתחברות עדיין נטענת. נסו שוב בעוד רגע." };
            }
            return ready.rpc("admin_hidden_order_ids").then(function (result) {
              var ids = [];
              if (result && result.error) {
                return { ids: [], error: messageFor(result.error) };
              }
              (result && result.data ? result.data : []).forEach(function (row) {
                if (typeof row === "string") {
                  ids.push(row);
                } else if (row && row.admin_hidden_order_ids) {
                  ids.push(row.admin_hidden_order_ids);
                } else if (row && row.order_id) {
                  ids.push(row.order_id);
                }
              });
              return { ids: ids, error: "" };
            }).catch(function () {
              return { ids: [], error: "לא הצלחנו לטעון את התורים המוסתרים." };
            });
          });
        });
      });
    },
    fetchCatalog: function () {
      return withClient(function (ready) {
        return ready.from("services").select("id, name, price_ils, minutes, addon, active").then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return { rows: result.data || [], error: "" };
        });
      });
    },
    fetchSchedule: function () {
      return withClient(function (ready) {
        return Promise.all([
          ready.from("weekly_hours").select("weekday, status, start_time, end_time, breaks, blocked").order("weekday"),
          ready.from("week_overrides").select("week_start, weekday, status, start_time, end_time, breaks, blocked"),
          ready.from("date_exceptions").select("service_date, status, start_time, end_time, breaks, blocked"),
          ready.from("business_settings").select("service_minutes, travel_minutes").eq("id", true).maybeSingle()
        ]).then(function (results) {
          var index;
          for (index = 0; index < results.length; index += 1) {
            if (results[index].error) {
              return { schedule: null, error: messageFor(results[index].error) };
            }
          }
          return {
            schedule: {
              weekly: results[0].data || [],
              weeks: results[1].data || [],
              exceptions: results[2].data || [],
              serviceMinutes: results[3].data && results[3].data.service_minutes !== null && results[3].data.service_minutes !== undefined ? Number(results[3].data.service_minutes) : null,
              travelMinutes: results[3].data && results[3].data.travel_minutes !== null && results[3].data.travel_minutes !== undefined ? Number(results[3].data.travel_minutes) : null
            },
            error: ""
          };
        });
      });
    },
    saveBusinessSettings: function (serviceMinutes, travelMinutes) {
      return withClient(function (ready) {
        return ready.from("business_settings").update({
          service_minutes: serviceMinutes,
          travel_minutes: travelMinutes
        }).eq("id", true).select("service_minutes, travel_minutes").then(function (result) {
          var row = result.data && result.data[0] ? result.data[0] : null;
          if (result.error || !row) {
            return { serviceMinutes: null, travelMinutes: null, error: result.error ? messageFor(result.error) : "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return {
            serviceMinutes: Number(row.service_minutes),
            travelMinutes: Number(row.travel_minutes),
            error: ""
          };
        });
      });
    },
    beginBookingWindow: function () {
      return blockAdminCustomer({ expiresAt: "", serverNow: "", expired: true, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        return ready.rpc("begin_booking_window").then(function (result) {
          return windowResult(result);
        });
      });
      });
    },
    currentBookingWindow: function () {
      return blockAdminCustomer({ expiresAt: "", serverNow: "", expired: true, error: adminOnCustomerPage }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
        return ready.rpc("current_booking_window").then(function (result) {
          return windowResult(result);
        });
      });
      });
    },
    endBookingWindow: function () {
      return blockAdminCustomer({ error: "" }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
        return withClient(function (ready) {
          return ready.rpc("end_booking_window").then(function (result) {
            if (result.error) {
              return { error: messageFor(result.error) };
            }
            return { error: "" };
          });
        });
      });
    },
    saveService: function (id, price) {
      return withClient(function (ready) {
        return ready.from("services").update({
          price_ils: price
        }).eq("id", id).select("id").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || !result.data.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return { error: "" };
        });
      });
    },
    saveWeeklyHours: function (rows) {
      return withClient(function (ready) {
        return ready.from("weekly_hours").upsert(rows, { onConflict: "weekday" }).select("weekday").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || result.data.length !== rows.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return { error: "" };
        });
      });
    },
    saveWeekOverride: function (weekStart, weekEnd, rows) {
      return withClient(function (ready) {
        return ready.from("week_overrides").upsert(rows, { onConflict: "week_start,weekday" }).select("weekday").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || result.data.length !== rows.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return ready.from("date_exceptions").delete().gte("service_date", weekStart).lte("service_date", weekEnd).then(function (cleared) {
            if (cleared.error) {
              return { error: messageFor(cleared.error) };
            }
            return { error: "" };
          });
        });
      });
    },
    clearWeekOverride: function (weekStart, weekEnd) {
      return withClient(function (ready) {
        return ready.from("week_overrides").delete().eq("week_start", weekStart).then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          return ready.from("date_exceptions").delete().gte("service_date", weekStart).lte("service_date", weekEnd).then(function (cleared) {
            if (cleared.error) {
              return { error: messageFor(cleared.error) };
            }
            return { error: "" };
          });
        });
      });
    },
    fetchBusy: function (from, to) {
      return withClient(function (ready) {
        return ready.rpc("list_busy_spans", { p_from: from, p_to: to }).then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return { rows: result.data || [], error: "" };
        });
      });
    },
    watchOrders: function (handler) {
      return blockAdminCustomer({ error: "" }).then(function (blocked) {
        if (blocked) {
          return blocked;
        }
      ordersWatch.handler = handler;
      ordersWatch.stopped = false;
      ordersWatch.again = false;
      return withClient(function (ready) {
        function start() {
          var generation;
          if (ordersWatch.stopped) {
            return { error: "" };
          }
          ordersWatch.generation += 1;
          generation = ordersWatch.generation;
          clearOrdersTimer();
          if (ordersWatch.channel) {
            var previous = ordersWatch.channel;
            ordersWatch.channel = null;
            ready.removeChannel(previous);
          }
          return applyRealtimeAuth(ready).then(function () {
            if (generation !== ordersWatch.generation || ordersWatch.stopped) {
              return { error: "" };
            }
            ensureOrdersPoll(generation);
            ordersWatch.channel = ready.channel("vip-orders-sync-" + generation).on("postgres_changes", {
              event: "*",
              schema: "public",
              table: "orders"
            }, function () {
              if (generation !== ordersWatch.generation || ordersWatch.stopped) {
                return;
              }
              pokeOrdersWatch();
            }).subscribe(function (status) {
              if (generation !== ordersWatch.generation || ordersWatch.stopped) {
                return;
              }
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                ensureOrdersPoll(generation);
              }
            });
            return { error: "" };
          });
        }
        return freshToken(ready).then(function (token) {
          if (token) {
            return start();
          }
          return new Promise(function (resolve) {
            window.setTimeout(function () {
              if (ordersWatch.stopped) {
                resolve({ error: "" });
                return;
              }
              freshToken(ready).then(function (later) {
                if (!later) {
                  resolve({ error: "" });
                  return;
                }
                resolve(start());
              });
            }, 500);
          });
        });
      });
      });
    },
    stopOrdersWatch: function () {
      ordersWatch.stopped = true;
      ordersWatch.handler = null;
      ordersWatch.again = false;
      ordersWatch.busy = false;
      ordersWatch.generation += 1;
      clearOrdersTimer();
      if (ordersWatch.channel && client) {
        var previous = ordersWatch.channel;
        ordersWatch.channel = null;
        client.removeChannel(previous);
      } else {
        ordersWatch.channel = null;
      }
      return Promise.resolve({ error: "" });
    }
  };
  window.VIP_SUPABASE = api;

  function startCheck() {
    checkConnection();
  }

  if (window.supabase && typeof window.supabase.createClient === "function") {
    startCheck();
  } else {
    var libraryScript = document.currentScript && document.currentScript.previousElementSibling;
    if (libraryScript && libraryScript.tagName === "SCRIPT") {
      libraryScript.addEventListener("load", startCheck);
      libraryScript.addEventListener("error", startCheck);
    } else {
      startCheck();
    }
  }
})();
