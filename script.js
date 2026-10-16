(function () {
  "use strict";

  var root = document.documentElement;
  var images = document.querySelectorAll(".hero__photo, .hero__logo");

  function reveal() {
    root.classList.add("is-ready");
  }

  var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

  var imageReady = Promise.all(Array.prototype.map.call(images, function (image) {
    if (image.complete) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      image.addEventListener("load", function () {
        resolve();
      }, { once: true });

      image.addEventListener("error", function () {
        resolve();
      }, { once: true });
    });
  }));

  var timeout = new Promise(function (resolve) {
    window.setTimeout(resolve, 2500);
  });

  Promise.race([Promise.all([fontsReady, imageReady]), timeout]).then(reveal);
})();

(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) {
    return;
  }

  var desktop = window.matchMedia("(min-width: 720px)");
  var backdrop = document.createElement("button");
  backdrop.className = "nav-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "סגירת תפריט");
  document.body.appendChild(backdrop);

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "סגירת תפריט" : "פתיחת תפריט");
    nav.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }

  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!open);
    if (!open) {
      var firstLink = nav.querySelector("a");
      if (firstLink) {
        firstLink.focus();
      }
    }
  });

  backdrop.addEventListener("click", function () {
    setOpen(false);
    toggle.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      setOpen(false);
    }
  });

  function closeOnDesktop() {
    if (desktop.matches) {
      setOpen(false);
    }
  }

  if (desktop.addEventListener) {
    desktop.addEventListener("change", closeOnDesktop);
  }
})();

(function () {
  "use strict";

  var storageKey = "vip-booking";

  function wholeCount(value) {
    var number = Number(value);
    if (!isFinite(number) || number < 0) {
      return 0;
    }
    return Math.floor(number);
  }

  function clipText(value, max) {
    var text = typeof value === "string" ? value.trim() : "";
    if (text.length > max) {
      return text.slice(0, max);
    }
    return text;
  }

  function readCustomer(data) {
    var source = data && data.customer && typeof data.customer === "object" ? data.customer : {};
    return {
      fullName: clipText(source.fullName, 80),
      phone: clipText(source.phone, 20),
      city: clipText(source.city, 60),
      street: clipText(source.street, 80),
      houseNumber: clipText(source.houseNumber, 20),
      entrance: clipText(source.entrance, 20),
      floor: clipText(source.floor, 10),
      apartment: clipText(source.apartment, 20),
      entryCode: clipText(source.entryCode, 20),
      notes: clipText(source.notes, 400),
      payment: source.payment === "paybox" || source.payment === "cash" || source.payment === "transfer" ? source.payment : ""
    };
  }

  function readBookingDraft() {
    var empty = {
      serviceId: "",
      adults: 0,
      children: 0,
      vip: 0,
      beards: 0,
      date: "",
      time: "",
      customer: readCustomer(null),
      submitted: readCustomer(null)
    };
    try {
      var raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        return empty;
      }
      var data = JSON.parse(raw);
      return {
        serviceId: typeof data.serviceId === "string" ? data.serviceId : "",
        adults: wholeCount(data.adults),
        children: wholeCount(data.children),
        vip: wholeCount(data.vip),
        beards: wholeCount(data.beards),
        date: typeof data.date === "string" ? data.date : "",
        time: typeof data.time === "string" ? data.time : "",
        customer: readCustomer(data),
        submitted: readCustomer({ customer: data.submitted })
      };
    } catch (error) {
      return empty;
    }
  }

  function writeBookingDraft(draft) {
    var adults = wholeCount(draft.adults);
    var beards = wholeCount(draft.beards);
    if (beards > adults) {
      beards = adults;
    }
    var current = readBookingDraft();
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        serviceId: typeof draft.serviceId === "string" ? draft.serviceId : "",
        adults: adults,
        children: wholeCount(draft.children),
        vip: wholeCount(draft.vip),
        beards: beards,
        date: typeof draft.date === "string" ? draft.date : "",
        time: typeof draft.time === "string" ? draft.time : "",
        customer: readCustomer(draft.customer ? draft : current),
        submitted: readCustomer({ customer: draft.submitted || current.submitted })
      }));
    } catch (error) {
      return;
    }
  }

  window.VIP_BOOKING = {
    read: readBookingDraft,
    write: writeBookingDraft,
    enoughPeople: function (draft) {
      var item = draft || readBookingDraft();
      return wholeCount(item.adults) + wholeCount(item.children) >= 2;
    },
    partySize: function (draft) {
      var item = draft || readBookingDraft();
      return wholeCount(item.adults) + wholeCount(item.children);
    },
    resetParty: function () {
      var draft = readBookingDraft();
      draft.adults = 0;
      draft.children = 0;
      draft.beards = 0;
      draft.vip = 0;
      draft.date = "";
      draft.time = "";
      writeBookingDraft(draft);
      try {
        sessionStorage.removeItem("vip-window-arm");
        sessionStorage.removeItem("vip-hold-id");
      } catch (error) {
        return;
      }
    },
    specialContactDigits: function () {
      var owner = window.VIP_DEMO && window.VIP_DEMO.owner ? window.VIP_DEMO.owner : null;
      return String(owner && owner.whatsappPhone ? owner.whatsappPhone : "972512177021").replace(/\D/g, "");
    },
    specialVisitMessage: function (draft) {
      var item = draft || readBookingDraft();
      var contact = item.submitted && (item.submitted.fullName || item.submitted.phone || item.submitted.payment) ? item.submitted : (item.customer || {});
      var lines = ["היי זאבי, אשמח לתאם ביקור לקבוצה:"];
      lines.push("מבוגרים: " + wholeCount(item.adults));
      lines.push("ילדים: " + wholeCount(item.children));
      if (wholeCount(item.beards)) {
        lines.push("זקן: " + wholeCount(item.beards));
      }
      lines.push("תאריך:");
      if (item.time) {
        lines.push("שעה: " + item.time);
      }
      if (contact.fullName) {
        lines.push("שם: " + contact.fullName);
      }
      if (contact.phone) {
        lines.push("טלפון: " + contact.phone);
      }
      if (contact.city || contact.street) {
        lines.push("כתובת: " + [contact.street, contact.houseNumber, contact.city].filter(Boolean).join(" "));
      }
      return lines.join("\n");
    },
    specialWhatsappHref: function (draft) {
      var digits = this.specialContactDigits();
      if (!digits) {
        return "";
      }
      return "https://wa.me/" + digits + "?text=" + encodeURIComponent(this.specialVisitMessage(draft));
    },
    photoKey: "vip-booking-entrance-photo",
    sentPhotoKey: "vip-booking-sent-photo",
    clear: function () {
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem("vip-booking-entrance-photo");
        sessionStorage.removeItem("vip-booking-sent-photo");
        sessionStorage.removeItem("vip-hold-id");
        sessionStorage.removeItem("vip-window-arm");
      } catch (error) {
        return;
      }
    },
    abandonExpired: function () {
      var path = window.location.pathname || "";
      try {
        if (sessionStorage.getItem("vip-hold-converted") === "1" || window.VIP_HOLD_CONVERTED) {
          return;
        }
      } catch (error) {
        if (window.VIP_HOLD_CONVERTED) {
          return;
        }
      }
      if (window.VIP_BOOKING_ABANDONING || window.VIP_SENDING) {
        return;
      }
      window.VIP_BOOKING_ABANDONING = true;
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem("vip-booking-entrance-photo");
        sessionStorage.removeItem("vip-booking-sent-photo");
        sessionStorage.removeItem("vip-hold-id");
        sessionStorage.removeItem("vip-window-arm");
      } catch (error) {
        path = path;
      }
      if (window.VIP_SUPABASE && window.VIP_SUPABASE.releaseHold) {
        window.VIP_SUPABASE.releaseHold();
      }
      if (!/index\.html$/.test(path) && !/\/$/.test(path)) {
        window.location.replace("index.html");
      }
    }
  };
})();

(function () {
  "use strict";

  var booking = window.VIP_BOOKING;
  if (!booking || !booking.resetParty) {
    return;
  }

  var file = window.location.pathname.split("/").pop() || "index.html";
  var rank = {
    "index.html": 0,
    "booking.html": 1,
    "booking-next.html": 2,
    "booking-details.html": 3,
    "booking-summary.html": 4
  };
  var here = rank[file] || 0;
  var flagKey = "vip-back-reset";

  function pageName(url) {
    var path = "";
    try {
      path = new URL(url, window.location.href).pathname;
    } catch (error) {
      return "";
    }
    var name = path.split("/").pop();
    return name || "index.html";
  }

  function navigationKind() {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    return nav && nav.type ? nav.type : "";
  }

  function clearClock() {
    if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.stop) {
      window.VIP_HOLD_UI.stop();
    }
    var client = window.VIP_SUPABASE;
    if (client && client.endBookingWindow) {
      client.endBookingWindow();
    }
    if (client && client.releaseHold) {
      client.releaseHold();
    }
  }

  function resetBack() {
    booking.resetParty();
    clearClock();
    if (typeof window.VIP_PARTY_SYNC === "function") {
      window.VIP_PARTY_SYNC();
    }
  }

  function arrivedBackward(from) {
    return (rank[from] || 0) > here;
  }

  if (navigationKind() === "reload") {
    try {
      sessionStorage.removeItem(flagKey);
    } catch (error) {
      here = here;
    }
  } else if (navigationKind() === "back_forward") {
    try {
      var from = sessionStorage.getItem(flagKey) || "";
      sessionStorage.removeItem(flagKey);
      if (arrivedBackward(from)) {
        resetBack();
      }
    } catch (error) {
      here = here;
    }
  } else {
    try {
      sessionStorage.removeItem(flagKey);
    } catch (error) {
      here = here;
    }
  }

  if (file !== "booking.html" && file !== "booking-next.html") {
    return;
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    var link = null;
    var href = "";
    var target = 0;
    while (node && node !== document) {
      if (node.tagName === "A") {
        link = node;
        break;
      }
      node = node.parentNode;
    }
    if (!link || link.getAttribute("aria-disabled") === "true") {
      return;
    }
    href = link.getAttribute("href") || "";
    if (!href || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0 || href.indexOf("http") === 0) {
      return;
    }
    target = rank[pageName(href)];
    if (target === undefined) {
      return;
    }
    if (target < here) {
      resetBack();
      return;
    }
    if (target > here) {
      window.VIP_LEAVE_FORWARD = true;
    }
  });

  window.addEventListener("pagehide", function () {
    if (window.VIP_LEAVE_FORWARD) {
      return;
    }
    try {
      sessionStorage.setItem(flagKey, file);
    } catch (error) {
      return;
    }
  });

  window.addEventListener("pageshow", function (event) {
    var from = "";
    if (!event.persisted) {
      return;
    }
    try {
      from = sessionStorage.getItem(flagKey) || "";
      sessionStorage.removeItem(flagKey);
    } catch (error) {
      from = "";
    }
    if (arrivedBackward(from)) {
      resetBack();
    }
    if (file === "booking-next.html" && booking.partySize(booking.read()) < 2) {
      window.location.reload();
    }
  });
})();

(function () {
  "use strict";

  var storageKey = "vip-orders";
  var viewingServer = false;
  var serverCache = [];
  var accountCache = [];
  var reloadGeneration = 0;

  function isServerId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(storageKey);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) {
        return [];
      }
      return list.filter(function (item) {
        return item && typeof item === "object" && typeof item.id === "string";
      }).map(function (item) {
        if (item.status !== "approved" && item.status !== "rejected" && item.status !== "cancelled") {
          item.status = "pending";
        }
        return item;
      });
    } catch (error) {
      return [];
    }
  }

  function readOrders() {
    if (viewingServer) {
      return serverCache.slice();
    }
    return readLocal();
  }

  function writeOrders(list) {
    localStorage.setItem(storageKey, JSON.stringify(list));
  }

  function addOrder(order) {
    var list = readOrders();
    var saved = {
      id: String(Date.now()) + "-" + Math.floor(Math.random() * 100000),
      status: "pending",
      createdAt: new Date().toISOString(),
      adults: order.adults || 0,
      children: order.children || 0,
      vip: order.vip || 0,
      beards: order.beards || 0,
      date: order.date || "",
      time: order.time || "",
      customer: order.customer || {},
      photo: order.photo || "",
      serverId: order.serverId || ""
    };
    if (!order.fromServer && window.VIP_SCHEDULE && window.VIP_SCHEDULE.slotOpen && !window.VIP_SCHEDULE.slotOpen(saved.date, saved.time)) {
      return null;
    }
    list.unshift(saved);
    try {
      writeOrders(list);
    } catch (error) {
      saved.photo = "";
      list[0] = saved;
      writeOrders(list);
    }
    return saved;
  }

  function setOrderStatus(id, status) {
    var list = readOrders().map(function (item) {
      if (item.id === id) {
        item.status = status;
      }
      return item;
    });
    writeOrders(list);
  }

  function mirrorLocal(serverId, status) {
    if (!serverId) {
      return;
    }
    var list = readLocal().map(function (item) {
      if (item.serverId === serverId) {
        item.status = status;
        if (status === "cancelled") {
          item.cancelledAt = new Date().toISOString();
        }
      }
      return item;
    });
    try {
      writeOrders(list);
    } catch (error) {
      return;
    }
  }

  function rememberServerStatus(id, status) {
    if (!id || !status) {
      return;
    }
    function stamp(list) {
      return list.map(function (order) {
        if (order && order.id === id) {
          order.status = status;
        }
        return order;
      });
    }
    accountCache = stamp(accountCache);
    if (viewingServer) {
      serverCache = stamp(serverCache);
    }
    mirrorLocal(id, status);
  }

  function serverResult(name, id, status) {
    var auth = window.VIP_SUPABASE;
    if (!auth || !auth.orderAction) {
      return Promise.resolve(null);
    }
    return auth.orderAction(name, id).then(function (result) {
      var confirmed = result && result.status ? result.status : "";
      if (!result || result.error || (confirmed && confirmed !== status)) {
        if (confirmed) {
          rememberServerStatus(id, confirmed);
        }
        return {
          id: id,
          error: result && result.error ? result.error : "הפעולה נכשלה.",
          status: confirmed
        };
      }
      rememberServerStatus(id, confirmed || status);
      return reloadAccount().then(function () {
        return { id: id, status: confirmed || status, server: true };
      });
    });
  }

  function approveOrder(id) {
    if (isServerId(id)) {
      return serverResult("approve_order", id, "approved");
    }
    setOrderStatus(id, "approved");
    return { id: id, status: "approved" };
  }

  function rejectOrder(id) {
    if (isServerId(id)) {
      return serverResult("reject_order", id, "rejected");
    }
    setOrderStatus(id, "rejected");
    return { id: id, status: "rejected" };
  }

  function appointmentAt(order) {
    var parts = String(order && order.date || "").split("-");
    var time = String(order && order.time || "").split(":");
    if (parts.length !== 3 || time.length < 2 || time[0] === "") {
      return null;
    }
    var point = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(time[0]), Number(time[1]) || 0, 0, 0);
    return isNaN(point.getTime()) ? null : point;
  }

  function customerMayCancel(order) {
    var point = appointmentAt(order);
    if (!order || (order.status !== "pending" && order.status !== "approved") || !point) {
      return false;
    }
    return point.getTime() - Date.now() > 7 * 60 * 60 * 1000;
  }

  function reloadAccount() {
    var auth = window.VIP_SUPABASE;
    var generation;
    if (!auth || !auth.fetchOrders) {
      return Promise.resolve({ rows: accountCache, error: "" });
    }
    reloadGeneration += 1;
    generation = reloadGeneration;
    return auth.fetchOrders().then(function (result) {
      if (generation !== reloadGeneration) {
        return { rows: accountCache, error: "", stale: true };
      }
      if (result && !result.error) {
        accountCache = result.rows || [];
        if (viewingServer) {
          serverCache = accountCache.slice();
        }
      }
      return result || { rows: accountCache, error: "" };
    });
  }

  function cancelOrder(id, meta) {
    var by = meta && meta.by === "customer" ? "customer" : "admin";
    if (isServerId(id)) {
      return serverResult(by === "customer" ? "cancel_order" : "admin_cancel_order", id, "cancelled");
    }
    var current = null;
    readOrders().forEach(function (item) {
      if (item.id === id) {
        current = item;
      }
    });
    if (!current || current.status === "cancelled") {
      return null;
    }
    if (by === "customer" && !customerMayCancel(current)) {
      return null;
    }
    var saved = null;
    var list = readOrders().map(function (item) {
      if (item.id === id) {
        item.status = "cancelled";
        item.cancelledAt = new Date().toISOString();
        item.cancelledBy = by;
        saved = item;
      }
      return item;
    });
    writeOrders(list);
    return saved;
  }

  window.VIP_ORDERS = {
    read: readOrders,
    add: addOrder,
    approve: approveOrder,
    reject: rejectOrder,
    cancel: cancelOrder,
    customerMayCancel: customerMayCancel,
    accountOrders: function () {
      return accountCache.slice();
    },
    reloadAccount: reloadAccount,
    forgetAccount: function () {
      accountCache = [];
      if (viewingServer) {
        serverCache = [];
      }
    },
    keepOwn: function (userId) {
      accountCache = accountCache.filter(function (order) {
        return order.customerId === userId;
      });
    },
    watchServer: function (on) {
      viewingServer = !!on;
      if (on) {
        serverCache = accountCache.slice();
      }
    },
    usesServer: function () {
      return viewingServer;
    },
    isServerId: isServerId
  };
})();

(function () {
  "use strict";

  var storageKey = "vip-admin-notices";

  function readNotices() {
    try {
      var raw = localStorage.getItem(storageKey);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) {
        return [];
      }
      return list.filter(function (item) {
        return item && typeof item.id === "string";
      });
    } catch (error) {
      return [];
    }
  }

  function writeNotices(list) {
    localStorage.setItem(storageKey, JSON.stringify(list));
  }

  window.VIP_NOTICES = {
    read: readNotices,
    add: function (notice) {
      var list = readNotices();
      list.unshift({
        id: String(Date.now()) + "-" + Math.floor(Math.random() * 100000),
        type: "customer-cancel",
        orderId: notice && notice.orderId ? notice.orderId : "",
        text: notice && notice.text ? notice.text : "הלקוח ביטל תור.",
        createdAt: new Date().toISOString(),
        seen: false
      });
      try {
        writeNotices(list);
      } catch (error) {
        return null;
      }
      return list[0];
    },
    markSeen: function (id) {
      writeNotices(readNotices().map(function (item) {
        if (item.id === id) {
          item.seen = true;
        }
        return item;
      }));
    }
  };
})();

(function () {
  "use strict";

  var party = document.getElementById("party");
  var savedView = document.getElementById("booking-saved");
  if (!party && !savedView) {
    return;
  }

  var booking = window.VIP_BOOKING;
  var data = window.VIP_DEMO;
  var services = data && data.services ? data.services : [];

  function findService(id) {
    var found = null;
    services.forEach(function (service) {
      if (service.id === id) {
        found = service;
      }
    });
    return found;
  }

  function numericPrice(id) {
    var service = findService(id);
    if (!service || service.priceOnRequest || service.priceIls === null || service.priceIls === undefined) {
      return null;
    }
    return service.priceIls;
  }

  function money(amount) {
    return amount + " ₪";
  }

  var pricesReady = false;

  function fillSummary(root, draft) {
    var adultPrice = numericPrice("mens-haircut");
    var childPrice = numericPrice("kids-haircut");
    var beardPrice = numericPrice("beard");
    var total = 0;

    root.textContent = "";

    function line(text) {
      var paragraph = document.createElement("p");
      paragraph.textContent = text;
      root.appendChild(paragraph);
    }

    if (!pricesReady) {
      line(data.priceError || "טוען מחירים…");
      return;
    }

    if (draft.adults + draft.children + draft.vip < 1) {
      line(root.id === "party-summary" ? "הזמנה החל משני אנשים." : "בחרו לפחות אדם אחד.");
      return;
    }

    if (draft.adults > 0 && adultPrice !== null) {
      total += draft.adults * adultPrice;
      line((draft.adults === 1 ? "מבוגר" : draft.adults + " מבוגרים") + ": " + money(draft.adults * adultPrice));
    }

    if (draft.children > 0 && childPrice !== null) {
      total += draft.children * childPrice;
      line((draft.children === 1 ? "ילד" : draft.children + " ילדים") + ": " + money(draft.children * childPrice));
    }

    if (draft.beards > 0 && beardPrice !== null) {
      total += draft.beards * beardPrice;
      line("סידור זקן: " + money(draft.beards * beardPrice));
    }

    if (draft.vip > 0 && total === 0) {
      line("סה״כ: מחיר בתיאום");
      return;
    }

    if (draft.vip > 0) {
      line("סה״כ: " + money(total) + ", וחבילת VIP בתיאום");
      return;
    }

    line("סה״כ: " + money(total));
    if (root.id === "party-summary" && draft.adults + draft.children < 2) {
      line("כדי להמשיך צריך לפחות שני אנשים.");
    }
  }

  if (savedView && booking) {
    fillSummary(savedView, booking.read());
  }

  function loadCatalog() {
    if (!data) {
      return;
    }
    if (!window.VIP_SUPABASE || !window.VIP_SUPABASE.fetchCatalog) {
      data.priceError = "לא הצלחנו לטעון את המחירים. נסו שוב בעוד רגע.";
      if (data.onUpdate) {
        data.onUpdate();
      }
      return;
    }
    window.VIP_SUPABASE.fetchCatalog().then(function (result) {
      if (!result || result.error || !data.applyServer || !result.rows || !result.rows.length) {
        data.priceError = result && result.error ? result.error : "לא הצלחנו לטעון את המחירים. נסו שוב בעוד רגע.";
        if (data.onUpdate) {
          data.onUpdate();
        }
        return;
      }
      data.applyServer(result.rows);
    }).catch(function () {
      data.priceError = "לא הצלחנו לטעון את המחירים. נסו שוב בעוד רגע.";
      if (data.onUpdate) {
        data.onUpdate();
      }
    });
  }

  if (!party || !booking) {
    if (savedView && data) {
      data.onUpdate = function () {
        pricesReady = !data.priceError;
        fillSummary(savedView, booking.read());
      };
      loadCatalog();
    }
    return;
  }

  var draft = booking.read();
  var adultsCount = document.getElementById("adults-count");
  var childrenCount = document.getElementById("children-count");
  var beardsCount = document.getElementById("beards-count");
  var adultsMinus = document.getElementById("adults-minus");
  var adultsPlus = document.getElementById("adults-plus");
  var childrenMinus = document.getElementById("children-minus");
  var childrenPlus = document.getElementById("children-plus");
  var beardsMinus = document.getElementById("beards-minus");
  var beardsPlus = document.getElementById("beards-plus");
  var beardStep = document.getElementById("beard-step");
  var summary = document.getElementById("party-summary");
  var continueLink = document.getElementById("party-continue");
  var adultRate = document.getElementById("adult-rate");
  var childRate = document.getElementById("child-rate");
  var beardNote = document.getElementById("beard-note");

  var adultPrice = null;
  var childPrice = null;
  var beardPrice = null;

  function showRates() {
    adultPrice = numericPrice("mens-haircut");
    childPrice = numericPrice("kids-haircut");
    beardPrice = numericPrice("beard");
    if (data.priceError) {
      if (adultRate) {
        adultRate.textContent = data.priceError;
      }
      if (childRate) {
        childRate.textContent = "";
      }
      if (beardNote) {
        beardNote.textContent = "";
      }
      return;
    }
    if (!pricesReady) {
      if (adultRate) {
        adultRate.textContent = "טוען מחירים…";
      }
      if (childRate) {
        childRate.textContent = "";
      }
      if (beardNote) {
        beardNote.textContent = "";
      }
      return;
    }
    if (adultRate) {
      adultRate.textContent = adultPrice === null ? "תספורת מבוגר" : "תספורת מבוגר, " + adultPrice + " ₪ לאדם";
    }
    if (childRate) {
      childRate.textContent = childPrice === null ? "תספורת ילד" : "תספורת ילד, " + childPrice + " ₪ לילד";
    }
    if (beardNote) {
      beardNote.textContent = beardPrice === null ? "וסידור זקן תוספת" : "וסידור זקן תוספת " + beardPrice + " ₪";
    }
  }

  function paint() {
    draft.vip = 0;
    if (draft.beards > draft.adults) {
      draft.beards = draft.adults;
    }
    booking.write(draft);
    draft = booking.read();

    adultsCount.textContent = String(draft.adults);
    childrenCount.textContent = String(draft.children);
    beardsCount.textContent = String(draft.beards);
    adultsMinus.disabled = draft.adults < 1;
    childrenMinus.disabled = draft.children < 1;
    beardsMinus.disabled = draft.beards < 1;
    beardsPlus.disabled = draft.adults < 1 || draft.beards >= draft.adults;
    if (beardStep) {
      beardStep.hidden = draft.adults < 1;
    }

    fillSummary(summary, draft);

    var ready = draft.adults + draft.children >= 2;
    continueLink.setAttribute("aria-disabled", ready ? "false" : "true");
    continueLink.tabIndex = ready ? 0 : -1;
  }

  function change(field, delta) {
    if (field === "beards" && delta > 0 && draft.beards >= draft.adults) {
      return;
    }
    draft[field] = Math.max(0, draft[field] + delta);
    paint();
  }

  adultsMinus.addEventListener("click", function () { change("adults", -1); });
  adultsPlus.addEventListener("click", function () { change("adults", 1); });
  childrenMinus.addEventListener("click", function () { change("children", -1); });
  childrenPlus.addEventListener("click", function () { change("children", 1); });
  beardsMinus.addEventListener("click", function () { change("beards", -1); });
  beardsPlus.addEventListener("click", function () { change("beards", 1); });

  var specialModal = document.getElementById("special-booking");
  var specialWhatsapp = document.getElementById("special-whatsapp");
  var specialPhone = document.getElementById("special-phone");
  var specialClose = document.getElementById("special-close");

  function openSpecialBooking() {
    var current = booking.read();
    var digits = booking.specialContactDigits();
    var href = booking.specialWhatsappHref(current);
    if (specialWhatsapp && href) {
      specialWhatsapp.href = href;
    }
    if (specialPhone && digits) {
      specialPhone.href = "tel:+" + digits;
    }
    if (specialModal && specialModal.showModal && !specialModal.open) {
      specialModal.showModal();
    }
  }

  if (specialClose && specialModal) {
    specialClose.addEventListener("click", function () {
      specialModal.close();
    });
  }

  continueLink.addEventListener("click", function (event) {
    if (continueLink.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    if (booking.partySize(booking.read()) > 5) {
      event.preventDefault();
      openSpecialBooking();
      return;
    }
    try {
      sessionStorage.setItem("vip-window-arm", "1");
    } catch (error) {
      return;
    }
  });

  showRates();
  data.onUpdate = function () {
    pricesReady = !data.priceError;
    showRates();
    paint();
    if (savedView) {
      fillSummary(savedView, booking.read());
    }
  };
  paint();
  loadCatalog();
  window.VIP_PARTY_SYNC = function () {
    draft = booking.read();
    paint();
  };
})();

(function () {
  "use strict";

  var grid = document.getElementById("cal-grid");
  var booking = window.VIP_BOOKING;
  if (!grid || !booking) {
    return;
  }

  var label = document.getElementById("cal-label");
  var times = document.getElementById("cal-times");
  var prev = document.getElementById("cal-prev");
  var next = document.getElementById("cal-next");
  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var schedule = window.VIP_SCHEDULE || { standing: {} };
  var draft = booking.read();
  if (booking.partySize(draft) > 5) {
    window.location.replace("booking.html");
    return;
  }
  var continueButton = document.getElementById("cal-continue");

  function jerusalemToday() {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    return new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
  }

  var todayStart = jerusalemToday();
  var view = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  function two(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function iso(date) {
    return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate());
  }

  function parse(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 3) {
      return null;
    }
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function isClosed(date) {
    var day = schedule.dayFor ? schedule.dayFor(date) : null;
    if (!day || day.status !== "hours") {
      return true;
    }
    return schedule.openSlots(date, { ignoreTaken: true, ignorePast: true }).length === 0;
  }

  function slotsFor(date) {
    if (!date || !schedule.openSlots) {
      return [];
    }
    return schedule.openSlots(date);
  }

  function bookingUntil(from) {
    if (schedule.bookingUntil) {
      return schedule.bookingUntil(from);
    }
    var extra = (6 - from.getDay()) + 7;
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + extra);
  }

  var bookUntil = bookingUntil(todayStart);
  var saved = parse(draft.date);
  if (!saved || saved < todayStart || saved > bookUntil || isClosed(saved)) {
    draft.date = "";
    draft.time = "";
    booking.write(draft);
  } else {
    view = new Date(saved.getFullYear(), saved.getMonth(), 1);
    if (slotsFor(saved).indexOf(draft.time) === -1) {
      draft.time = "";
      booking.write(draft);
    }
  }

  function save() {
    booking.write(draft);
  }

  function renderTimes(date) {
    times.textContent = "";
    if (!date) {
      return;
    }
    var slots = slotsFor(date);
    if (schedule.loadError) {
      var waiting = document.createElement("p");
      waiting.textContent = schedule.loadError;
      times.appendChild(waiting);
      return;
    }
    if (!slots.length) {
      var note = document.createElement("p");
      var hadHours = schedule.openSlots(date, { ignoreTaken: true, ignorePast: true }).length > 0;
      var stillToday = schedule.openSlots(date, { ignoreTaken: true }).length > 0;
      if (hadHours && !stillToday && iso(date) === iso(todayStart)) {
        note.textContent = "השעות להיום כבר עברו.";
      } else {
        note.textContent = "אין תורים פנויים ביום הזה. אפשר לבחור יום אחר.";
      }
      times.appendChild(note);
      return;
    }
    var row = document.createElement("div");
    row.className = "cal__slots";
    slots.forEach(function (slot) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cal__slot";
      button.textContent = slot;
      button.setAttribute("aria-pressed", draft.time === slot ? "true" : "false");
      button.addEventListener("click", function () {
        selectSlot(slot);
      });
      row.appendChild(button);
    });
    times.appendChild(row);
  }

  function render() {
    var year = view.getFullYear();
    var month = view.getMonth();
    var hint = document.querySelector(".cal__hint");
    label.textContent = months[month] + " " + year;
    prev.disabled = year === todayStart.getFullYear() && month === todayStart.getMonth();
    next.disabled = new Date(year, month + 1, 1) > bookUntil;
    if (hint) {
      hint.hidden = !schedule.loadError;
      hint.textContent = schedule.loadError || "";
    }
    grid.textContent = "";

    var first = new Date(year, month, 1);
    var days = new Date(year, month + 1, 0).getDate();
    var offset = first.getDay();
    var index;
    for (index = 0; index < offset; index += 1) {
      var blank = document.createElement("span");
      blank.className = "cal__blank";
      grid.appendChild(blank);
    }

    for (index = 1; index <= days; index += 1) {
      var date = new Date(year, month, index);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cal__day";
      button.textContent = String(index);
      var beyondWeek = date > bookUntil;
      button.setAttribute("aria-label", index + " ב" + months[month] + " " + year + (beyondWeek ? ", עדיין לא נפתח להזמנה" : ""));
      if (date < todayStart || beyondWeek || isClosed(date)) {
        button.disabled = true;
        if (!beyondWeek && isClosed(date)) {
          button.classList.add("is-closed");
        }
      }
      if (iso(date) === iso(todayStart)) {
        button.classList.add("is-today");
      }
      if (draft.date === iso(date)) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      button.addEventListener("click", function (event) {
        var chosen = new Date(year, month, Number(event.currentTarget.textContent));
        var nextIso = iso(chosen);
        if (draft.date !== nextIso) {
          draft.time = "";
          dropHold();
        }
        draft.date = nextIso;
        if (slotsFor(chosen).indexOf(draft.time) === -1) {
          draft.time = "";
        }
        save();
        render();
      });
      grid.appendChild(button);
    }

    if (!holdBusy && !schedule.unavailable && !schedule.loadError && draft.date && draft.time && slotsFor(parse(draft.date)).indexOf(draft.time) === -1) {
      var owned = holdReady && holdReady.date === draft.date && holdReady.time === draft.time;
      if (!owned) {
        draft.time = "";
        save();
      }
    }
    renderTimes(parse(draft.date));
    if (times) {
      times.setAttribute("aria-busy", holdBusy ? "true" : "false");
    }
    if (continueButton) {
      var enough = booking.enoughPeople(draft);
      var picked = !!(draft.date && draft.time && enough && !schedule.unavailable && !schedule.loadError);
      var people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
      var saved = people > 5 || (!holdBusy && holdReady && holdReady.date === draft.date && holdReady.time === draft.time && bookingWindowOpen());
      var ready = picked && saved;
      continueButton.disabled = !ready;
      continueButton.setAttribute("aria-disabled", ready ? "false" : "true");
    }
  }

  prev.addEventListener("click", function () {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    render();
  });
  next.addEventListener("click", function () {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    render();
  });
  var loadedSchedule = null;
  var releaseReady = Promise.resolve();

  function clearHoldToken() {
    try {
      sessionStorage.removeItem("vip-hold-id");
    } catch (error) {
      return;
    }
  }

  function sayCal(text) {
    var status = document.getElementById("cal-status");
    if (status) {
      status.textContent = text || "";
    }
  }

  var busyGeneration = 0;
  var busyPoll = 0;
  var busyInFlight = false;
  var busyAgain = false;

  function selectedStillFree() {
    if (!draft.date || !draft.time) {
      return true;
    }
    if (holdReady && holdReady.date === draft.date && holdReady.time === draft.time) {
      return true;
    }
    return slotsFor(parse(draft.date)).indexOf(draft.time) !== -1;
  }

  function applyBusyRows(rows) {
    var own = holdReady && holdReady.date === draft.date && holdReady.time === draft.time ? holdReady : null;
    schedule.applyRemote(loadedSchedule, own ? withoutOwnHold(rows, own) : rows);
    if (!holdBusy && draft.time && !selectedStillFree()) {
      draft.time = "";
      save();
      sayCal("השעה הזו כבר אינה זמינה. בחרו שעה אחרת.");
    }
    render();
  }

  function refreshBusy() {
    if (!loadedSchedule || !window.VIP_SUPABASE || !window.VIP_SUPABASE.fetchBusy) {
      render();
      return;
    }
    if (busyInFlight) {
      busyAgain = true;
      return;
    }
    busyInFlight = true;
    busyGeneration += 1;
    var generation = busyGeneration;
    window.VIP_SUPABASE.fetchBusy(iso(todayStart), iso(bookUntil)).then(function (busy) {
      var again;
      if (generation !== busyGeneration) {
        return;
      }
      busyInFlight = false;
      again = busyAgain;
      busyAgain = false;
      if (document.hidden) {
        return;
      }
      if (busy && !busy.error) {
        applyBusyRows(busy.rows || []);
      } else {
        render();
      }
      if (again && !document.hidden) {
        refreshBusy();
      }
    }).catch(function () {
      var again;
      if (generation !== busyGeneration) {
        return;
      }
      busyInFlight = false;
      again = busyAgain;
      busyAgain = false;
      if (!document.hidden) {
        render();
      }
      if (again && !document.hidden) {
        refreshBusy();
      }
    });
  }

  function startBusyPoll() {
    if (busyPoll || !loadedSchedule) {
      return;
    }
    busyPoll = window.setInterval(function () {
      if (document.hidden) {
        return;
      }
      refreshBusy();
    }, 5000);
  }

  function stopBusyPoll() {
    busyGeneration += 1;
    busyInFlight = false;
    busyAgain = false;
    if (busyPoll) {
      window.clearInterval(busyPoll);
      busyPoll = 0;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopBusyPoll();
      return;
    }
    if (loadedSchedule) {
      startBusyPoll();
      refreshBusy();
    }
  });
  window.addEventListener("pagehide", stopBusyPoll);

  var holdGeneration = 0;
  var holdChain = Promise.resolve();
  var holdReady = null;
  var holdBusy = false;
  var holdTarget = "";

  function dropHold() {
    var generation = ++holdGeneration;
    holdReady = null;
    holdBusy = false;
    holdTarget = "";
    clearHoldToken();
    holdChain = holdChain.then(function () {
      if (generation !== holdGeneration) {
        return null;
      }
      if (window.VIP_SUPABASE && window.VIP_SUPABASE.releaseHold) {
        return window.VIP_SUPABASE.releaseHold();
      }
      return null;
    }).catch(function () {
      return null;
    });
  }

  function bookingWindowLeft() {
    var left = window.VIP_HOLD_UI && window.VIP_HOLD_UI.remaining ? window.VIP_HOLD_UI.remaining() : null;
    return typeof left === "number" ? left : null;
  }

  function bookingWindowOpen() {
    var left = bookingWindowLeft();
    return left !== null && left > 0;
  }

  function bookingWindowEnded() {
    var left = bookingWindowLeft();
    return left !== null && left <= 0;
  }

  function bookingWindowNote() {
    var left = window.VIP_HOLD_UI && window.VIP_HOLD_UI.remaining ? window.VIP_HOLD_UI.remaining() : null;
    if (left !== null && left <= 0) {
      return "עברו 10 הדקות להזמנה. בחרו שעה מחדש.";
    }
    return "בודק את הזמן…";
  }

  function endExpiredWindow() {
    if (window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
      window.VIP_BOOKING.abandonExpired();
    }
  }

  function applyBookingWindow(result) {
    if (result && result.error) {
      sayCal(result.error);
      return;
    }
    if (!result || result.expired || !result.expiresAt) {
      endExpiredWindow();
      return;
    }
    if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.start) {
      window.VIP_HOLD_UI.start(result.expiresAt, result.serverNow, true);
    }
    render();
  }

  function windowArmed() {
    try {
      if (sessionStorage.getItem("vip-window-arm") === "1") {
        sessionStorage.removeItem("vip-window-arm");
        return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  function restoreWindowArm() {
    try {
      sessionStorage.setItem("vip-window-arm", "1");
    } catch (error) {
      return;
    }
  }

  function syncBookingWindow() {
    var people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
    var client = window.VIP_SUPABASE;
    var armed = windowArmed();
    if (people > 5) {
      return;
    }
    if (!client || !client.session || !client.beginBookingWindow || !client.currentBookingWindow) {
      if (armed) {
        restoreWindowArm();
      }
      return;
    }
    client.session().then(function (sessionResult) {
      if (!sessionResult || !sessionResult.session) {
        if (armed) {
          restoreWindowArm();
        }
        if (window.VIP_AUTH && window.VIP_AUTH.open) {
          window.VIP_AUTH.open(function () {
            syncBookingWindow();
          }, "כדי להתחיל את ההזמנה צריך להתחבר.");
        } else {
          sayCal("כדי להתחיל את ההזמנה צריך להתחבר.");
        }
        return null;
      }
      if (armed) {
        return client.beginBookingWindow();
      }
      return client.currentBookingWindow();
    }).then(function (result) {
      if (!result) {
        return;
      }
      if (armed && result.error) {
        restoreWindowArm();
      }
      applyBookingWindow(result);
    }).catch(function () {
      if (armed) {
        restoreWindowArm();
      }
      sayCal("לא הצלחנו להתחיל את ההזמנה. נסו שוב בעוד רגע.");
    });
  }

  function rememberHold(id) {
    try {
      sessionStorage.setItem("vip-hold-id", id);
      return true;
    } catch (error) {
      clearHoldToken();
      return false;
    }
  }

  function holdIsCurrent(hold) {
    var expires = hold ? Date.parse(hold.expiresAt) : NaN;
    var serverNow = hold ? Date.parse(hold.serverNow || "") : NaN;
    var still = !isNaN(serverNow) && !isNaN(expires) && expires > serverNow;
    return !!(hold && holdReady && hold.id === holdReady.id && hold.date === draft.date && String(hold.time || "").slice(0, 5) === draft.time && Number(hold.adults) === Number(draft.adults) && Number(hold.children) === Number(draft.children) && Number(hold.beards) === Number(draft.beards) && still);
  }

  function selectSlot(slot) {
    var people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
    var target = draft.date + "|" + slot;
    var generation;
    draft.time = slot;
    save();
    if (people > 5) {
      if (holdReady || holdBusy) {
        dropHold();
      }
      render();
      return;
    }
    if (people <= 5 && bookingWindowEnded()) {
      endExpiredWindow();
      return;
    }
    if (people <= 5 && !bookingWindowOpen()) {
      if (bookingWindowLeft() !== null) {
        sayCal(bookingWindowNote());
      }
      render();
      return;
    }
    if (holdReady && holdReady.date === draft.date && holdReady.time === slot && !holdBusy) {
      render();
      return;
    }
    if (holdBusy && holdTarget === target) {
      render();
      return;
    }
    generation = ++holdGeneration;
    holdReady = null;
    holdBusy = true;
    holdTarget = target;
    clearHoldToken();
    sayCal("");
    render();
    holdChain = holdChain.then(function () {
      var client = window.VIP_SUPABASE;
      if (generation !== holdGeneration) {
        return null;
      }
      if (!client || !client.holdSlot || !client.session) {
        return { error: "אין חיבור כרגע. נסו שוב בעוד רגע." };
      }
      return client.session().then(function (result) {
        if (generation !== holdGeneration) {
          return null;
        }
        if (!result || !result.session) {
          if (window.VIP_AUTH && window.VIP_AUTH.open) {
            window.VIP_AUTH.open(function () {
              if (generation !== holdGeneration) {
                return;
              }
              holdBusy = false;
              holdTarget = "";
              selectSlot(slot);
            }, "כדי לשמור את השעה צריך להתחבר.");
          }
          return { error: "כדי לשמור את השעה צריך להתחבר.", needsAuth: true };
        }
        return client.holdSlot({
          adults: draft.adults,
          children: draft.children,
          beards: draft.beards,
          date: draft.date,
          time: slot
        });
      });
    }).then(function (result) {
      if (!result || generation !== holdGeneration) {
        return;
      }
      holdBusy = false;
      holdTarget = "";
      if (result.needsAuth) {
        holdReady = null;
        sayCal(result.error);
        render();
        return;
      }
      if (result.error || !result.holdId || !result.expiresAt) {
        holdReady = null;
        clearHoldToken();
        sayCal(result.error || "השעה לא נשמרה.");
        refreshBusy();
        return;
      }
      rememberHold(result.holdId);
      holdReady = {
        date: draft.date,
        time: slot,
        id: result.holdId,
        expiresAt: result.expiresAt
      };
      sayCal("");
      if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.start) {
        window.VIP_HOLD_UI.start(result.expiresAt, result.serverNow);
      }
      render();
    }).catch(function () {
      if (generation !== holdGeneration) {
        return;
      }
      holdBusy = false;
      holdTarget = "";
      holdReady = null;
      clearHoldToken();
      sayCal("השעה לא נשמרה.");
      render();
    });
  }

  window.VIP_HOLD_LEAVE = function () {
    dropHold();
  };
  window.VIP_HOLD_ON_EXPIRE = function () {
    holdReady = null;
    holdBusy = false;
    holdTarget = "";
    clearHoldToken();
  };

  var abandonHold = window.location.search.indexOf("hold=expired") !== -1 || window.location.search.indexOf("release=1") !== -1;
  if (abandonHold) {
    clearHoldToken();
    if (window.VIP_SUPABASE && window.VIP_SUPABASE.releaseHold) {
      releaseReady = window.VIP_SUPABASE.releaseHold().catch(function () {
        return { error: "" };
      });
    }
  }
  holdChain = releaseReady;

  function jerusalemClock(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return "";
    }
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(date);
      var hour = "";
      var minute = "";
      parts.forEach(function (part) {
        if (part.type === "hour") {
          hour = part.value;
        }
        if (part.type === "minute") {
          minute = part.value;
        }
      });
      return hour && minute ? hour + ":" + minute : "";
    } catch (error) {
      return "";
    }
  }

  function sameDraftHold(hold) {
    var expires = hold ? Date.parse(hold.expiresAt) : NaN;
    return !!(hold && hold.id && hold.date === draft.date && String(hold.time || "").slice(0, 5) === draft.time && Number(hold.adults) === Number(draft.adults) && Number(hold.children) === Number(draft.children) && Number(hold.beards) === Number(draft.beards) && !isNaN(expires) && expires > Date.now());
  }

  function withoutOwnHold(rows, hold) {
    return (rows || []).filter(function (row) {
      var day = String(row.appointment_date || "").slice(0, 10);
      return !(hold && day === hold.date && jerusalemClock(row.starts_at) === String(hold.time || "").slice(0, 5));
    });
  }
  if (continueButton) {
    continueButton.addEventListener("click", function () {
      var people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
      var client = window.VIP_SUPABASE;
      if (!draft.date || !draft.time || !booking.enoughPeople(draft) || parse(draft.date) > bookUntil) {
        if (!booking.enoughPeople(draft)) {
          window.location.href = "booking.html";
        }
        return;
      }
      booking.write(draft);
      if (people > 5) {
        window.VIP_LEAVE_FORWARD = true;
        window.location.href = "booking-details.html";
        return;
      }
      if (bookingWindowEnded()) {
        endExpiredWindow();
        return;
      }
      if (!bookingWindowOpen()) {
        if (bookingWindowLeft() !== null) {
          sayCal(bookingWindowNote());
        }
        return;
      }
      if (holdBusy || !holdReady || holdReady.date !== draft.date || holdReady.time !== draft.time) {
        sayCal(holdBusy ? "" : "בחרו שעה פנויה כדי לשמור אותה.");
        return;
      }
      if (!client || !client.currentHold) {
        sayCal("אין חיבור כרגע. נסו שוב בעוד רגע.");
        return;
      }
      continueButton.disabled = true;
      client.currentHold().then(function (result) {
        if (!holdIsCurrent(result && result.hold)) {
          holdReady = null;
          holdBusy = false;
          clearHoldToken();
          if (bookingWindowEnded()) {
            endExpiredWindow();
          } else {
            sayCal(result && result.error ? result.error : "הזמן לשמירת השעה הסתיים. בחרו שעה מחדש.");
          }
          render();
          return;
        }
        window.VIP_LEAVE_FORWARD = true;
        window.location.href = "booking-details.html";
      }).catch(function () {
        sayCal("לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.");
        render();
      });
    });
  }
  function failSchedule(text) {
    schedule.fitVisit = false;
    schedule.unavailable = true;
    schedule.loadError = text;
    render();
  }

  if (window.VIP_SUPABASE && window.VIP_SUPABASE.fetchSchedule && window.VIP_SUPABASE.fetchBusy && window.VIP_SUPABASE.fetchCatalog && schedule.applyRemote) {
    schedule.fitVisit = false;
    schedule.unavailable = true;
    schedule.loadError = "טוען שעות פנויות…";
  }
  render();
  if (window.location.search.indexOf("hold=expired") !== -1) {
    sayCal("הזמן לשמירת השעה הסתיים. בחרו שעה מחדש.");
  } else if (window.location.search.indexOf("release=1") !== -1) {
    sayCal("השעה כבר לא שמורה. בחרו שעה מחדש.");
  }
  if (window.VIP_SUPABASE && window.VIP_SUPABASE.fetchSchedule && window.VIP_SUPABASE.fetchBusy && window.VIP_SUPABASE.fetchCatalog && schedule.applyRemote) {
    var restoreGeneration = holdGeneration;
    releaseReady.then(function () {
      var jobs = [
        window.VIP_SUPABASE.fetchSchedule(),
        window.VIP_SUPABASE.fetchCatalog(),
        window.VIP_SUPABASE.fetchBusy(iso(todayStart), iso(bookUntil))
      ];
      if (!abandonHold && (Number(draft.adults) || 0) + (Number(draft.children) || 0) <= 5 && window.VIP_SUPABASE.currentHold) {
        jobs.push(window.VIP_SUPABASE.currentHold().catch(function () {
          return { hold: null, error: "" };
        }));
      }
      return Promise.all(jobs);
    }).then(function (loaded) {
      var result = loaded[0];
      var catalog = loaded[1];
      var busy = loaded[2];
      if (!result || result.error || !result.schedule || !result.schedule.weekly || !result.schedule.weekly.length) {
        failSchedule(result && result.error ? result.error : "לא הצלחנו לטעון את השעות הפנויות. נסו שוב בעוד רגע.");
        return;
      }
      if (!catalog || catalog.error || !window.VIP_DEMO || !window.VIP_DEMO.applyServer || !catalog.rows || !catalog.rows.length) {
        failSchedule(catalog && catalog.error ? catalog.error : "לא הצלחנו לטעון את המחירים. נסו שוב בעוד רגע.");
        return;
      }
      if (!busy || busy.error) {
        failSchedule(busy && busy.error ? busy.error : "לא הצלחנו לטעון את השעות התפוסות. נסו שוב בעוד רגע.");
        return;
      }
      window.VIP_DEMO.applyServer(catalog.rows);
      if (typeof result.schedule.serviceMinutes !== "number" || typeof result.schedule.travelMinutes !== "number") {
        failSchedule("לא הצלחנו לטעון את משך השירות. נסו שוב בעוד רגע.");
        return;
      }
      schedule.fitVisit = true;
      loadedSchedule = result.schedule;
      var kept = restoreGeneration === holdGeneration && loaded[3] && loaded[3].hold && sameDraftHold(loaded[3].hold) ? loaded[3].hold : null;
      schedule.applyRemote(result.schedule, kept ? withoutOwnHold(busy.rows, kept) : busy.rows);
      if (kept && rememberHold(kept.id)) {
        holdReady = {
          date: kept.date,
          time: String(kept.time || "").slice(0, 5),
          id: kept.id,
          expiresAt: kept.expiresAt
        };
        sayCal("");
      } else if (restoreGeneration === holdGeneration && !abandonHold && draft.time && (Number(draft.adults) || 0) + (Number(draft.children) || 0) <= 5) {
        clearHoldToken();
        holdReady = null;
        sayCal("לחצו על השעה כדי לשמור אותה.");
      }
      render();
      startBusyPoll();
    }).catch(function () {
      failSchedule("לא הצלחנו לטעון את השעות הפנויות. נסו שוב בעוד רגע.");
    });
  }
  syncBookingWindow();
})();

(function () {
  "use strict";

  var form = document.getElementById("customer-form");
  var booking = window.VIP_BOOKING;
  if (!form || !booking) {
    return;
  }

  var draft = booking.read();
  var partyCount = booking.partySize(draft);
  if (partyCount > 5) {
    window.location.replace("booking.html");
    return;
  }
  window.VIP_SLOT_HOLD = { pending: true, id: "", matches: false, blocked: false, expired: false, retry: false, unverified: false, message: "" };
  var customer = draft.customer;
  if (window.location.search.indexOf("edit=1") !== -1 && draft.submitted && (draft.submitted.fullName || draft.submitted.phone)) {
    customer = draft.submitted;
    try {
      var sentPhoto = sessionStorage.getItem(booking.sentPhotoKey) || "";
      if (sentPhoto && !sessionStorage.getItem(booking.photoKey)) {
        sessionStorage.setItem(booking.photoKey, sentPhoto);
      }
    } catch (error) {
      customer = draft.submitted;
    }
  }
  var fields = {
    fullName: document.getElementById("full-name"),
    phone: document.getElementById("phone"),
    city: document.getElementById("city"),
    street: document.getElementById("street"),
    houseNumber: document.getElementById("house-number"),
    entrance: document.getElementById("entrance"),
    floor: document.getElementById("floor"),
    apartment: document.getElementById("apartment"),
    entryCode: document.getElementById("entry-code"),
    notes: document.getElementById("notes")
  };
  var continueButton = document.getElementById("details-continue");
  var preview = document.getElementById("photo-preview");
  var previewImage = document.getElementById("photo-image");
  var photoStatus = document.getElementById("photo-status");
  var removePhoto = document.getElementById("photo-remove");
  var galleryInput = document.getElementById("photo-gallery-input");
  var cameraInput = document.getElementById("photo-camera-input");
  var paymentInputs = form.querySelectorAll("input[name='payment']");
  var paymentError = document.getElementById("payment-error");
  var touched = {};

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function phoneOk(value) {
    var count = digits(value).length;
    return count >= 9 && count <= 15;
  }

  function readFields() {
    return {
      fullName: fields.fullName.value,
      phone: fields.phone.value,
      city: fields.city.value,
      street: fields.street.value,
      houseNumber: fields.houseNumber.value,
      entrance: fields.entrance.value,
      floor: fields.floor.value,
      apartment: fields.apartment.value,
      entryCode: fields.entryCode.value,
      notes: fields.notes.value,
      payment: selectedPayment()
    };
  }

  function selectedPayment() {
    var chosen = "";
    Array.prototype.forEach.call(paymentInputs, function (input) {
      if (input.checked) {
        chosen = input.value;
      }
    });
    return chosen;
  }

  function requirementError(name, value) {
    if (name === "fullName" && value.fullName.trim().length < 2) {
      return "יש להזין שם מלא.";
    }
    if (name === "phone" && !phoneOk(value.phone)) {
      return "יש להזין מספר טלפון תקין.";
    }
    if (name === "city" && value.city.trim().length < 2) {
      return "יש להזין עיר.";
    }
    if (name === "street" && value.street.trim().length < 2) {
      return "יש להזין רחוב.";
    }
    if (name === "houseNumber" && value.houseNumber.trim().length < 1) {
      return "יש להזין מספר בית.";
    }
    if (name === "payment" && value.payment !== "paybox" && value.payment !== "cash" && value.payment !== "transfer") {
      return "יש לבחור איך משלמים.";
    }
    return "";
  }

  function ready(value) {
    return !requirementError("fullName", value) && !requirementError("phone", value) && !requirementError("city", value) && !requirementError("street", value) && !requirementError("houseNumber", value) && !requirementError("payment", value);
  }

  function paintField(name, value, show) {
    var input = fields[name];
    var slot = document.getElementById(input.id + "-error");
    var message = show ? requirementError(name, value) : "";
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    if (slot) {
      slot.textContent = message;
    }
  }

  function paint() {
    var value = readFields();
    Object.keys(fields).forEach(function (name) {
      if (requirementError(name, value) === "" || touched[name]) {
        paintField(name, value, !!touched[name]);
      }
    });
    if (paymentError) {
      paymentError.textContent = touched.payment ? requirementError("payment", value) : "";
    }
    var ok = ready(value);
    var holdState = window.VIP_SLOT_HOLD || {};
    var holdOk = partyCount > 5 || (!!holdState.matches && !holdState.blocked && !holdState.pending);
    var enabled = ok && holdOk;
    continueButton.disabled = !enabled;
    continueButton.setAttribute("aria-disabled", enabled ? "false" : "true");
    updateProfileSync();
  }

  // Saved profile details fill only empty fields. The customer still reviews them here.
  var account = window.VIP_SUPABASE;
  var profileValues = null;
  var profileKeys = ["fullName", "phone", "city", "street", "houseNumber", "entrance", "floor", "apartment", "entryCode"];
  var profileSync = document.createElement("label");
  var profileSyncBox = document.createElement("input");
  profileSync.className = "profile-sync";
  profileSync.hidden = true;
  profileSyncBox.type = "checkbox";
  profileSyncBox.id = "profile-sync";
  profileSync.appendChild(profileSyncBox);
  profileSync.appendChild(document.createTextNode("לשמור את השינויים גם בפרופיל שלי"));
  continueButton.insertAdjacentElement("beforebegin", profileSync);

  function profileContact(profile) {
    var address = profile.address || {};
    return {
      fullName: profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" "),
      phone: profile.phone || "",
      city: address.city || "",
      street: address.street || "",
      houseNumber: address.houseNumber || "",
      entrance: address.entrance || "",
      floor: address.floor || "",
      apartment: address.apartment || "",
      entryCode: address.entryCode || ""
    };
  }

  function profileChanged() {
    if (!profileValues) {
      return false;
    }
    var value = readFields();
    return profileKeys.some(function (key) {
      return String(value[key] || "").trim() !== String(profileValues[key] || "").trim();
    });
  }

  function updateProfileSync() {
    if (!profileSync) {
      return;
    }
    profileSync.hidden = !profileChanged();
  }

  function saveToProfile() {
    if (!profileValues || profileSync.hidden || !profileSyncBox.checked || !account || !account.saveMyProfile) {
      return Promise.resolve();
    }
    var value = readFields();
    var name = String(value.fullName || "").trim().split(/\s+/);
    var save = account.saveMyProfile({
      firstName: name.shift() || "",
      lastName: name.join(" "),
      phone: value.phone,
      address: {
        city: value.city,
        street: value.street,
        houseNumber: value.houseNumber,
        entrance: value.entrance,
        floor: value.floor,
        apartment: value.apartment,
        entryCode: value.entryCode
      }
    }).catch(function () {
      return null;
    });
    var limit = new Promise(function (resolve) {
      window.setTimeout(resolve, 4000);
    });
    return Promise.race([save, limit]);
  }

  if (account && account.myProfile) {
    account.myProfile().then(function (result) {
      if (!result || !result.ready || !result.profile) {
        return;
      }
      profileValues = profileContact(result.profile);
      profileKeys.forEach(function (key) {
        if (fields[key] && !fields[key].value.trim() && profileValues[key]) {
          fields[key].value = profileValues[key];
        }
      });
      paint();
    }).catch(function () {
      return null;
    });
  }

  function showPhoto(url) {
    var panel = preview.closest(".photo-panel");
    if (!url) {
      preview.hidden = true;
      previewImage.removeAttribute("src");
      removePhoto.hidden = true;
      if (panel) {
        panel.classList.remove("is-ready");
      }
      return;
    }
    previewImage.src = url;
    preview.hidden = false;
    removePhoto.hidden = false;
    if (panel) {
      panel.classList.add("is-ready");
    }
  }

  function storePhoto(file) {
    if (!file || file.type.indexOf("image/") !== 0) {
      photoStatus.textContent = "אפשר לבחור קובץ תמונה בלבד.";
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        var maxSide = 1280;
        var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        var context = canvas.getContext("2d");
        if (!context) {
          photoStatus.textContent = "לא ניתן להציג את התמונה. נסו תמונה אחרת.";
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        var url = canvas.toDataURL("image/jpeg", 0.72);
        try {
          sessionStorage.setItem(booking.photoKey, url);
        } catch (error) {
          photoStatus.textContent = "התמונה גדולה מדי. בחרו תמונה קטנה יותר.";
          return;
        }
        photoStatus.textContent = "התמונה נשמרה.";
        showPhoto(url);
      };
      image.onerror = function () {
        photoStatus.textContent = "לא ניתן לקרוא את התמונה.";
      };
      image.src = reader.result;
    };
    reader.onerror = function () {
      photoStatus.textContent = "לא ניתן לקרוא את התמונה.";
    };
    reader.readAsDataURL(file);
  }

  Object.keys(fields).forEach(function (name) {
    fields[name].value = customer[name] || "";
    fields[name].addEventListener("input", paint);
    fields[name].addEventListener("blur", function () {
      touched[name] = true;
      paint();
    });
  });
  Array.prototype.forEach.call(paymentInputs, function (input) {
    input.checked = input.value === customer.payment;
    input.addEventListener("change", function () {
      touched.payment = true;
      paint();
    });
  });

  document.getElementById("photo-gallery").addEventListener("click", function () {
    galleryInput.click();
  });
  document.getElementById("photo-camera").addEventListener("click", function () {
    cameraInput.click();
  });
  galleryInput.addEventListener("change", function () {
    storePhoto(galleryInput.files && galleryInput.files[0]);
    galleryInput.value = "";
  });
  cameraInput.addEventListener("change", function () {
    storePhoto(cameraInput.files && cameraInput.files[0]);
    cameraInput.value = "";
  });
  removePhoto.addEventListener("click", function () {
    try {
      sessionStorage.removeItem(booking.photoKey);
    } catch (error) {
      return;
    }
    photoStatus.textContent = "התמונה הוסרה.";
    showPhoto("");
  });

  try {
    showPhoto(sessionStorage.getItem(booking.photoKey) || "");
  } catch (error) {
    showPhoto("");
  }

  var detailsBusy = false;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (detailsBusy) {
      return;
    }
    if (!booking.enoughPeople(draft)) {
      window.location.href = "booking.html";
      return;
    }
    Object.keys(fields).forEach(function (name) {
      touched[name] = true;
    });
    touched.payment = true;
    paint();
    if (!ready(readFields())) {
      return;
    }
    function proceed() {
      saveToProfile().then(leaveForSummary, leaveForSummary);
    }
    if (partyCount > 5) {
      proceed();
      return;
    }
    if (!window.VIP_HOLD_UI || !window.VIP_HOLD_UI.confirm) {
      var missing = document.getElementById("hold-status");
      if (missing) {
        missing.textContent = "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.";
      }
      continueButton.disabled = true;
      return;
    }
    detailsBusy = true;
    continueButton.disabled = true;
    window.VIP_HOLD_UI.confirm().then(function (check) {
      detailsBusy = false;
      if (!check || !check.ok) {
        paint();
        return;
      }
      proceed();
    }).catch(function () {
      detailsBusy = false;
      var failed = document.getElementById("hold-status");
      if (failed) {
        failed.textContent = "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.";
      }
      paint();
    });
  });

  function leaveForSummary() {
    draft.submitted = readFields();
    draft.customer = {
      fullName: "",
      phone: "",
      city: "",
      street: "",
      houseNumber: "",
      entrance: "",
      floor: "",
      apartment: "",
      entryCode: "",
      notes: "",
      payment: ""
    };
    booking.write(draft);
    var sentPhoto = "";
    try {
      sentPhoto = sessionStorage.getItem(booking.photoKey) || "";
      if (sentPhoto) {
        sessionStorage.setItem(booking.sentPhotoKey, sentPhoto);
      } else {
        sessionStorage.removeItem(booking.sentPhotoKey);
      }
      sessionStorage.removeItem(booking.photoKey);
    } catch (error) {
      sentPhoto = "";
    }
    form.reset();
    window.location.href = "booking-summary.html";
  }

  window.VIP_HOLD_WATCH = paint;
  paint();
})();

(function () {
  "use strict";

  var root = document.getElementById("booking-summary");
  var booking = window.VIP_BOOKING;
  if (!root || !booking) {
    return;
  }

  var draft = booking.read();
  if (booking.partySize(draft) > 5) {
    window.location.replace("booking.html");
    return;
  }
  var customer = draft.submitted && (draft.submitted.fullName || draft.submitted.phone || draft.submitted.payment) ? draft.submitted : draft.customer;
  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var when = document.getElementById("summary-when");
  var who = document.getElementById("summary-customer");
  var address = document.getElementById("summary-address");
  var photo = document.getElementById("summary-photo");
  var paymentSummary = document.getElementById("summary-payment");
  var paymentNames = { paybox: "PayBox", cash: "מזומן", transfer: "העברה בנקאית" };
  var services = window.VIP_DEMO && window.VIP_DEMO.services ? window.VIP_DEMO.services : [];

  function line(parent, text) {
    var paragraph = document.createElement("p");
    paragraph.textContent = text;
    parent.appendChild(paragraph);
  }

  function serviceName() {
    var name = "";
    services.forEach(function (service) {
      if (service.id === draft.serviceId) {
        name = service.name;
      }
    });
    return name;
  }

  var chosen = serviceName();
  if (chosen && document.getElementById("summary-service")) {
    line(document.getElementById("summary-service"), "שירות שנבחר: " + chosen);
  }

  var parts = String(draft.date || "").split("-");
  var dateLabel = "";
  if (parts.length === 3) {
    var month = Number(parts[1]);
    dateLabel = Number(parts[2]) + " ב" + (months[month - 1] || "") + " " + parts[0];
  }
  if (dateLabel && draft.time) {
    line(when, dateLabel + ", בשעה " + draft.time);
  } else {
    line(when, "לא נבחרו תאריך ושעה.");
  }

  if (customer.fullName) {
    line(who, "שם: " + customer.fullName);
  }
  if (customer.phone) {
    line(who, "טלפון: " + customer.phone);
  }
  if (!customer.fullName && !customer.phone) {
    line(who, "לא מולאו פרטי לקוח.");
  }

  var streetLine = customer.street;
  if (customer.houseNumber) {
    streetLine = streetLine ? streetLine + " " + customer.houseNumber : customer.houseNumber;
  }
  var fullAddress = customer.city ? (streetLine ? streetLine + ", " + customer.city : customer.city) : streetLine;
  if (fullAddress) {
    line(address, fullAddress);
  } else {
    line(address, "לא הוזנה כתובת.");
  }
  if (customer.entrance) {
    line(address, "כניסה: " + customer.entrance);
  }
  if (customer.floor) {
    line(address, "קומה: " + customer.floor);
  }
  if (customer.apartment) {
    line(address, "דירה: " + customer.apartment);
  }
  if (customer.entryCode) {
    line(address, "קוד כניסה: " + customer.entryCode);
  }
  if (customer.notes) {
    line(address, "הערות: " + customer.notes);
  }
  if (paymentSummary) {
    line(paymentSummary, paymentNames[customer.payment] || "לא נבחר אמצעי תשלום.");
  }
  var storedPhoto = "";
  try {
    storedPhoto = sessionStorage.getItem(booking.sentPhotoKey) || "";
  } catch (error) {
    storedPhoto = "";
  }
  if (storedPhoto) {
    var image = document.createElement("img");
    image.src = storedPhoto;
    image.alt = "תמונת הכניסה לבניין";
    photo.appendChild(image);
  } else {
    line(photo, "לא נוספה תמונת כניסה.");
  }
})();

(function () {
  "use strict";

  var button = document.getElementById("send-request");
  var booking = window.VIP_BOOKING;
  if (!button || !booking) {
    return;
  }

  var draft = booking.read();
  var people = booking.partySize(draft);
  if (people > 5) {
    window.location.replace("booking.html");
    return;
  }
  var modal = document.getElementById("sent-modal");
  var closeModal = document.getElementById("sent-close");
  var sendStatus = document.getElementById("send-status");
  var largeParty = people > 5;

  function saySend(text) {
    if (sendStatus) {
      sendStatus.textContent = text;
    }
  }

  function contactLabel(digits) {
    if (digits.indexOf("972") === 0 && digits.length === 12) {
      return "+" + digits.slice(0, 3) + " " + digits.slice(3, 5) + "-" + digits.slice(5, 8) + "-" + digits.slice(8);
    }
    return "+" + digits;
  }

  if (largeParty) {
    var panel = document.getElementById("large-party");
    var whatsapp = document.getElementById("large-whatsapp");
    var phoneLink = document.getElementById("large-phone");
    var partyText = document.getElementById("large-party-text");
    var digits = booking.specialContactDigits();
    if (partyText) {
      partyText.textContent = "לקבוצה של יותר מחמישה אנשים זאבי ישמח לתאם את הביקור אישית. אפשר לחזור ולבחור עד חמישה אנשים, או ליצור קשר עכשיו.";
    }
    if (whatsapp && digits) {
      whatsapp.href = booking.specialWhatsappHref(draft);
    }
    if (phoneLink && digits) {
      phoneLink.href = "tel:+" + digits;
      phoneLink.textContent = "טלפון: " + contactLabel(digits);
    }
    if (panel) {
      panel.hidden = false;
    }
    button.hidden = true;
  } else {
    button.disabled = true;
  }

  button.addEventListener("click", function () {
    var auth = window.VIP_SUPABASE;
    var customer;
    var photo = "";
    if (!booking.enoughPeople(draft)) {
      window.location.href = "booking.html";
      return;
    }
    draft = booking.read();
    customer = draft.submitted && (draft.submitted.fullName || draft.submitted.phone) ? draft.submitted : draft.customer;
    if ((Number(draft.adults) || 0) + (Number(draft.children) || 0) > 5) {
      saySend("לקבוצה של יותר מחמישה אנשים זאבי מתאם אישית. אפשר לפנות בטלפון או בוואטסאפ.");
      return;
    }
    if (!draft.date || !draft.time || !customer.fullName || !customer.phone || !customer.payment) {
      saySend("חסרים פרטים להזמנה. חזרו לשלב הפרטים.");
      return;
    }
    var watched = window.VIP_SLOT_HOLD || {};
    if (watched.pending) {
      saySend("בודק את השעה…");
      return;
    }
    if (!watched.unverified && (!watched.matches || watched.blocked || watched.expired)) {
      saySend(watched.message || "הזמן לשמירת השעה הסתיים. בחרו שעה מחדש.");
      button.disabled = true;
      return;
    }
    if (!auth || !auth.whenReady || !auth.requestAppointment) {
      saySend("אין חיבור כרגע. נסו שוב בעוד רגע.");
      return;
    }
    if (!window.VIP_HOLD_UI || !window.VIP_HOLD_UI.confirm) {
      saySend("לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.");
      button.disabled = true;
      return;
    }
    button.disabled = true;
    saySend("בודק את השעה…");
    window.VIP_HOLD_UI.confirm().then(function (check) {
      if (!check || !check.ok || !check.hold || !check.hold.id) {
        var expiredText = check && check.error ? check.error : "הזמן לשמירת השעה הסתיים. בחרו שעה מחדש.";
        saySend(expiredText);
        button.disabled = true;
        if (expiredText.indexOf("הסתיים") !== -1) {
          if (window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
            window.VIP_BOOKING.abandonExpired();
          }
          return { id: "", skipped: true };
        }
        if (expiredText.indexOf("פגה") !== -1) {
          window.location.href = "booking-next.html?hold=expired";
          return { id: "", skipped: true };
        }
        if (expiredText.indexOf("להתחבר") !== -1) {
          button.disabled = false;
          if (window.VIP_AUTH && window.VIP_AUTH.open) {
            window.VIP_AUTH.open(function () {
              button.click();
            }, expiredText);
          }
        }
        return { id: "", skipped: true };
      }
      var activeHoldId = check.hold.id;
      var holdExpires = Date.parse(check.hold.expiresAt);
      var holdServerNow = Date.parse(check.hold.serverNow || "");
      if (isNaN(holdServerNow) || isNaN(holdExpires) || holdExpires <= holdServerNow) {
        saySend("עברו 10 הדקות להזמנה. בחרו שעה מחדש.");
        button.disabled = true;
        if (window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
          window.VIP_BOOKING.abandonExpired();
        }
        return { id: "", skipped: true };
      }
      window.VIP_SENDING = true;
      saySend("שולח את הבקשה…");
      try {
        photo = sessionStorage.getItem(booking.sentPhotoKey) || "";
      } catch (error) {
        photo = "";
      }
      return auth.whenReady().then(function (ready) {
        if (!ready) {
          return { id: "", error: "אין חיבור כרגע. נסו שוב בעוד רגע." };
        }
        return auth.session();
      }).then(function (result) {
        if (result && result.error && !result.session) {
          return { id: "", error: result.error };
        }
        if (!result || !result.session) {
          window.VIP_SENDING = false;
          button.disabled = false;
          saySend("");
          if (window.VIP_AUTH && window.VIP_AUTH.open) {
            window.VIP_AUTH.open(function () {
              button.click();
            }, result && result.error ? result.error : "כדי לשלוח את הבקשה צריך להתחבר או להירשם.");
          } else {
            saySend("כדי לשלוח את הבקשה צריך להתחבר או להירשם.");
          }
          return { id: "", skipped: true };
        }
        return auth.requestAppointment({
          adults: draft.adults,
          children: draft.children,
          beards: draft.beards,
          date: draft.date,
          time: draft.time,
          fullName: customer.fullName,
          phone: customer.phone,
          city: customer.city,
          street: customer.street,
          houseNumber: customer.houseNumber,
          entrance: customer.entrance,
          floor: customer.floor,
          apartment: customer.apartment,
          entryCode: customer.entryCode,
          notes: customer.notes,
          payment: customer.payment,
          holdId: activeHoldId
        });
      });
    }).then(function (result) {
      if (result && result.skipped) {
        return;
      }
      window.VIP_SENDING = false;
      if (!result || result.error || !result.id) {
        var failure = result && result.error ? result.error : "לא הצלחנו לשלוח את הבקשה. נסו שוב בעוד רגע.";
        saySend(failure);
        if (failure.indexOf("הסתיים") !== -1 || failure.indexOf("פגה") !== -1) {
          button.disabled = true;
          try {
            sessionStorage.removeItem("vip-hold-id");
          } catch (error) {
            failure = failure;
          }
          if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.stop) {
            window.VIP_HOLD_UI.stop();
          }
          if (failure.indexOf("הסתיים") !== -1 && window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
            window.VIP_BOOKING.abandonExpired();
            return;
          }
          window.location.href = "booking-next.html?hold=expired";
          return;
        }
        button.disabled = false;
        return;
      }
      try {
        sessionStorage.removeItem("vip-hold-id");
        sessionStorage.setItem("vip-hold-converted", "1");
      } catch (error) {
        window.VIP_HOLD_CONVERTED = true;
      }
      window.VIP_HOLD_CONVERTED = true;
      if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.stop) {
        window.VIP_HOLD_UI.stop();
      }
      if (window.VIP_ORDERS && !window.VIP_ORDERS.read().some(function (item) {
        return item.serverId === result.id;
      })) {
        window.VIP_ORDERS.add({
          fromServer: true,
          serverId: result.id,
          adults: draft.adults,
          children: draft.children,
          vip: draft.vip,
          beards: draft.beards,
          date: draft.date,
          time: draft.time,
          customer: customer,
          photo: photo
        });
      }
      saySend("");
      if (modal && modal.showModal) {
        modal.showModal();
      }
    }).catch(function () {
      window.VIP_SENDING = false;
      button.disabled = false;
      saySend("לא הצלחנו לשלוח את הבקשה. נסו שוב בעוד רגע.");
    });
  });

  if (closeModal) {
    closeModal.addEventListener("click", function () {
      window.location.href = "orders.html";
    });
  }
})();

(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var nav = document.getElementById("site-nav");
  if (!header || !nav) {
    return;
  }

  var steps = ["booking.html", "booking-next.html", "booking-details.html", "booking-summary.html"];
  var file = window.location.pathname.split("/").pop();
  if (!file || file === "index.html" || file === "orders.html" || file === "profile.html") {
    return;
  }
  var current = file === "booking-wait.html" ? steps.length - 1 : steps.indexOf(file);
  var total = steps.length;
  var bar = document.createElement("div");
  var label = document.createElement("p");
  var track = document.createElement("div");
  var index;

  bar.className = "step-progress";
  label.className = "step-progress__label";
  track.className = "step-progress__track";
  if (current === -1) {
    label.textContent = total + " שלבים";
    bar.setAttribute("aria-label", total + " שלבים להזמנה");
  } else {
    label.textContent = "שלב " + (current + 1) + " מתוך " + total;
    bar.setAttribute("aria-label", label.textContent);
  }
  for (index = 0; index < total; index += 1) {
    var part = document.createElement("span");
    if (current !== -1 && index <= current) {
      part.className = "is-done";
    }
    track.appendChild(part);
  }
  bar.appendChild(label);
  bar.appendChild(track);
  header.insertAdjacentElement("afterend", bar);

  function place() {
    bar.style.top = header.offsetHeight + "px";
  }

  place();
  window.addEventListener("resize", place);
})();

(function () {
  "use strict";

  var list = document.getElementById("orders-list");
  var requests = document.getElementById("request-list");
  var orders = window.VIP_ORDERS;
  if ((!list && !requests) || !orders) {
    return;
  }

  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

  function dateLabel(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 3) {
      return "לא נבחר תאריך";
    }
    var month = Number(parts[1]);
    return Number(parts[2]) + " ב" + (months[month - 1] || "") + " " + parts[0];
  }

  function addressOf(customer) {
    var street = customer.street || "";
    if (customer.houseNumber) {
      street = street ? street + " " + customer.houseNumber : customer.houseNumber;
    }
    if (customer.city) {
      return street ? street + ", " + customer.city : customer.city;
    }
    return street || "לא הוזנה כתובת";
  }

  function counts(order) {
    var parts = [];
    if (order.adults) {
      parts.push("מבוגרים: " + order.adults);
    }
    if (order.children) {
      parts.push("ילדים: " + order.children);
    }
    if (order.vip) {
      parts.push("VIP: " + order.vip);
    }
    if (order.beards) {
      parts.push("זקן: " + order.beards);
    }
    return parts.join(" · ") || "לא נבחרה כמות";
  }

  var accountFailed = false;
  var signedIn = false;
  var accessReady = false;
  var accountUserId = "";
  var ordersLive = false;
  var ordersFeedback = document.getElementById("orders-feedback");

  function sayOrders(text) {
    if (ordersFeedback && document.getElementById("orders-list")) {
      ordersFeedback.textContent = text;
    }
  }

  function shownOrders() {
    if (!signedIn) {
      return [];
    }
    var remote = accountFailed || !orders.accountOrders ? [] : orders.accountOrders();
    var seen = {};
    remote.forEach(function (order) {
      if (order && order.id) {
        seen[order.id] = true;
      }
    });
    var onDevice = orders.read().filter(function (order) {
      if (!order || order.server || order.serverId || seen[order.id] || seen[order.serverId]) {
        return false;
      }
      return true;
    });
    return remote.concat(onDevice);
  }

  function detailRow(parent, label, value) {
    var row = document.createElement("div");
    var name = document.createElement("span");
    var text = document.createElement("span");
    row.className = "order-card__row";
    name.className = "order-card__label";
    name.textContent = label;
    text.className = "order-card__value";
    text.textContent = value;
    row.appendChild(name);
    row.appendChild(text);
    parent.appendChild(row);
  }

  var hiddenKey = "vip-hidden-order-cards";

  function hiddenMap() {
    try {
      var raw = localStorage.getItem(hiddenKey);
      var list = raw ? JSON.parse(raw) : [];
      var map = {};
      if (!Array.isArray(list)) {
        return map;
      }
      list.forEach(function (id) {
        if (id) {
          map[String(id)] = true;
        }
      });
      return map;
    } catch (error) {
      return {};
    }
  }

  function hideCard(order) {
    var map = hiddenMap();
    var list = [];
    if (order.id) {
      map[String(order.id)] = true;
    }
    if (order.serverId) {
      map[String(order.serverId)] = true;
    }
    Object.keys(map).forEach(function (id) {
      list.push(id);
    });
    try {
      localStorage.setItem(hiddenKey, JSON.stringify(list));
    } catch (error) {
      return;
    }
  }

  function paint(target, canApprove) {
    var hidden = canApprove ? {} : hiddenMap();
    var items = shownOrders().filter(function (order) {
      if (!order || canApprove) {
        return !!order;
      }
      return !hidden[String(order.id || "")] && !hidden[String(order.serverId || "")];
    });
    var title = document.getElementById("orders-title");
    var intro = document.getElementById("orders-intro");
    target.textContent = "";
    if (title) {
      title.hidden = false;
    }
    if (intro) {
      intro.hidden = !signedIn;
    }
    if (!items.length) {
      if (accountFailed || !accessReady) {
        return;
      }
      var empty = document.createElement("p");
      empty.className = "orders-empty";
      empty.textContent = window.VIP_ADMIN_CUSTOMER ? "החשבון המחובר הוא חשבון מנהל. ההזמנות נמצאות באזור הניהול." : (signedIn ? "אין עדיין הזמנות." : "כדי לראות את ההזמנות צריך להתחבר.");
      target.appendChild(empty);
      return;
    }
    items.forEach(function (order) {
      var customer = order.customer || {};
      var card = document.createElement("article");
      var top = document.createElement("div");
      var status = document.createElement("span");
      var state = order.status === "approved" || order.status === "rejected" || order.status === "cancelled" ? order.status : "pending";
      card.className = "order-card";
      top.className = "order-card__top";
      status.className = "order-card__status is-" + state;
      status.textContent = state === "approved" ? "מאושר" : state === "rejected" ? "נדחה" : state === "cancelled" ? "בוטל" : "ממתין";
      top.appendChild(status);
      if (!canApprove) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "order-card__remove";
        remove.setAttribute("aria-label", "הסרת הכרטיס");
        remove.textContent = "×";
        remove.addEventListener("click", function () {
          hideCard(order);
          paint(target, canApprove);
        });
        top.appendChild(remove);
      }
      card.appendChild(top);
      detailRow(card, "מועד", dateLabel(order.date) + (order.time ? " · " + order.time : ""));
      detailRow(card, "אנשים", counts(order));
      detailRow(card, "שם", customer.fullName || "ללא שם");
      if (customer.phone) {
        detailRow(card, "טלפון", customer.phone);
      }
      detailRow(card, "כתובת", addressOf(customer));
      if (order.photo) {
        var image = document.createElement("img");
        image.src = order.photo;
        image.alt = "תמונת הכניסה לבניין";
        card.appendChild(image);
      }
      if (!canApprove && (order.status === "pending" || order.status === "approved")) {
        if (orders.customerMayCancel(order)) {
          var cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "btn btn--ghost order-card__cancel";
          cancel.textContent = "ביטול ההזמנה";
          cancel.addEventListener("click", function () {
            askCancel(order);
          });
          card.appendChild(cancel);
        } else {
          var lock = document.createElement("p");
          lock.className = "orders-lock";
          lock.textContent = order.date && order.time ? "אי אפשר לבטל החל מ־7 שעות לפני התור." : "אי אפשר לבטל בלי תאריך ושעה.";
          card.appendChild(lock);
        }
      }
      if (canApprove && order.status === "pending") {
        var approve = document.createElement("button");
        approve.type = "button";
        approve.className = "btn btn--gold order-card__approve";
        approve.textContent = "אישור התור";
        approve.addEventListener("click", function () {
          approve.textContent = "אישור התור";
          approve.addEventListener("click", function () {
          });
        });
        card.appendChild(approve);
      }
      target.appendChild(card);
    });
  }

  if (list) {
    function refreshOrdersQuiet() {
      if (!signedIn || !accountUserId || !orders.reloadAccount) {
        return null;
      }
      return orders.reloadAccount().then(function (loaded) {
        if (!signedIn || !accountUserId) {
          return;
        }
        if (!loaded || loaded.error) {
          return;
        }
        accountFailed = false;
        if (orders.keepOwn) {
          orders.keepOwn(accountUserId);
        }
        sayOrders("");
        paint(list, false);
      });
    }

    function ensureOrdersLive() {
      var liveAuth = window.VIP_SUPABASE;
      if (ordersLive || !accountUserId || !liveAuth || !liveAuth.watchOrders) {
        return;
      }
      ordersLive = true;
      liveAuth.watchOrders(refreshOrdersQuiet);
    }

    function stopOrdersLive() {
      ordersLive = false;
      accountUserId = "";
      if (window.VIP_SUPABASE && window.VIP_SUPABASE.stopOrdersWatch) {
        window.VIP_SUPABASE.stopOrdersWatch();
      }
    }

    function showAdminCustomerOrders() {
      signedIn = false;
      accessReady = true;
      accountFailed = false;
      stopOrdersLive();
      if (orders.forgetAccount) {
        orders.forgetAccount();
      }
      sayOrders("");
      paint(list, false);
      return Promise.resolve();
    }

    function loadOwnOrders() {
      var auth = window.VIP_SUPABASE;
      if (window.VIP_ADMIN_CUSTOMER) {
        return showAdminCustomerOrders();
      }
      if (!auth || !auth.profile || !orders.reloadAccount) {
        accountFailed = true;
        if (orders.forgetAccount) {
          orders.forgetAccount();
        }
        sayOrders("לא הצלחנו לטעון את ההזמנות. נסו שוב בעוד רגע.");
        paint(list, false);
        return Promise.resolve();
      }
      sayOrders("טוען את ההזמנות…");
      return auth.profile().then(function (result) {
        if (!result || !result.session || !result.session.user) {
          signedIn = false;
          accessReady = true;
          stopOrdersLive();
          accountFailed = !!(result && result.error);
          if (orders.forgetAccount) {
            orders.forgetAccount();
          }
          sayOrders(accountFailed ? result.error : "");
          paint(list, false);
          return null;
        }
        signedIn = true;
        accessReady = true;
        accountUserId = result.session.user.id;
        ensureOrdersLive();
        return orders.reloadAccount().then(function (loaded) {
          if (!loaded || loaded.error) {
            accountFailed = true;
            if (orders.forgetAccount) {
              orders.forgetAccount();
            }
            sayOrders(loaded && loaded.error ? loaded.error : "לא הצלחנו לטעון את ההזמנות. נסו שוב בעוד רגע.");
            paint(list, false);
            return null;
          }
          accountFailed = false;
          if (orders.keepOwn) {
            orders.keepOwn(result.session.user.id);
          }
          sayOrders("");
          paint(list, false);
          return loaded;
        });
      }).catch(function () {
        accountFailed = true;
        if (orders.forgetAccount) {
          orders.forgetAccount();
        }
        sayOrders("לא הצלחנו לטעון את ההזמנות. נסו שוב בעוד רגע.");
        paint(list, false);
      });
    }
    orders.showAccount = function (session) {
      if (window.VIP_ADMIN_CUSTOMER) {
        return showAdminCustomerOrders();
      }
      if (session && session.user) {
        signedIn = true;
        accessReady = true;
        return loadOwnOrders();
      }
      signedIn = false;
      accessReady = true;
      accountFailed = false;
      stopOrdersLive();
      if (orders.forgetAccount) {
        orders.forgetAccount();
      }
      sayOrders("");
      paint(list, false);
      return Promise.resolve();
    };
    orders.paintCustomerList = function () {
      accountFailed = false;
      sayOrders("");
      paint(list, false);
    };
    orders.refreshCustomerList = loadOwnOrders;
  }
  if (requests) {
    paint(requests, true);
  }

  var cancelId = "";
  var dialog = document.getElementById("order-cancel");
  var dialogText = document.getElementById("order-cancel-text");
  var feedback = document.getElementById("orders-feedback");
  var confirmYes = document.getElementById("order-cancel-yes");
  var confirmNo = document.getElementById("order-cancel-no");

  function askCancel(order) {
    cancelId = order.id;
    if (dialogText) {
      dialogText.textContent = "לבטל את ההזמנה ב" + dateLabel(order.date) + (order.time ? ", בשעה " + order.time : "") + "?";
    }
    if (dialog && dialog.showModal) {
      dialog.showModal();
    }
  }

  function finishCancel(saved) {
    if (!saved || saved.error) {
      if (feedback) {
        feedback.textContent = saved && saved.error ? saved.error : "אי אפשר לבטל החל מ־7 שעות לפני התור.";
      }
    } else if (saved.server) {
      if (feedback) {
        feedback.textContent = "ההזמנה בוטלה.";
      }
    } else {
      if (window.VIP_NOTICES) {
        var customer = saved.customer || {};
        window.VIP_NOTICES.add({
          orderId: saved.id,
          text: "הלקוח ביטל תור: " + dateLabel(saved.date) + (saved.time ? " בשעה " + saved.time : "") + (customer.fullName ? ", " + customer.fullName : "")
        });
      }
      if (feedback) {
        feedback.textContent = "ההזמנה בוטלה.";
      }
    }
    cancelId = "";
    if (dialog && dialog.close) {
      dialog.close();
    }
    if (list) {
      paint(list, false);
    }
  }

  if (confirmYes) {
    confirmYes.addEventListener("click", function () {
      var saved = orders.cancel(cancelId, { by: "customer" });
      if (saved && typeof saved.then === "function") {
      var saved = orders.cancel(cancelId, { by: "customer" });
        return;
      }
      finishCancel(saved);
    });
  }
  if (confirmNo && dialog) {
    confirmNo.addEventListener("click", function () {
      cancelId = "";
      dialog.close();
    });
  }
})();

(function () {
  "use strict";

  var auth = window.VIP_SUPABASE;
  var header = document.querySelector(".site-header");
  if (!auth || !header || document.body.classList.contains("admin")) {
    return;
  }

  var brand = header.querySelector(".brand");
  var menu = header.querySelector(".nav-toggle");
  var userLabel = document.createElement("span");
  var authButton = document.createElement("button");
  var dialog = document.createElement("dialog");
  var pending = null;
  var activeSession = null;
  var accountGeneration = 0;

  userLabel.className = "header-user";
  userLabel.hidden = true;
  authButton.type = "button";
  authButton.className = "header-auth";
  authButton.textContent = "התחברות";
  if (brand) {
    brand.insertAdjacentElement("afterend", userLabel);
  } else {
    header.insertBefore(userLabel, header.firstChild);
  }
  var authGroup = document.createElement("div");
  authGroup.className = "header-auth-group";
  authGroup.appendChild(authButton);
  if (menu) {
    menu.insertAdjacentElement("beforebegin", authGroup);
  } else {
    header.appendChild(authGroup);
  }

  dialog.className = "sent-modal auth-modal";
  dialog.setAttribute("aria-labelledby", "auth-title");
  dialog.innerHTML = ""
    + "<h2 id=\"auth-title\">התחברות</h2>"
    + "<form id=\"auth-form\" method=\"post\" action=\"#\" autocomplete=\"off\" novalidate>"
    + "<div class=\"field\"><label for=\"auth-username\">שם משתמש</label>"
    + "<input id=\"auth-username\" name=\"vip-user\" type=\"text\" autocomplete=\"off\" maxlength=\"24\" autocapitalize=\"none\" spellcheck=\"false\">"
    + "<p class=\"auth-hint\" id=\"auth-hint\" hidden>השם באנגלית בלבד, אותיות ומספרים</p></div>"
    + "<div class=\"field\"><label for=\"auth-password\">סיסמה</label>"
    + "<div class=\"auth-secret\"><input id=\"auth-password\" name=\"vip-pass\" type=\"password\" autocomplete=\"new-password\" maxlength=\"200\">"
    + "<button type=\"button\" id=\"auth-eye\" aria-controls=\"auth-password\" aria-pressed=\"false\" aria-label=\"הצגת הסיסמה\">"
    + "<svg class=\"eye-open\" viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" aria-hidden=\"true\"><path d=\"M2.2 12S5.8 6.2 12 6.2 21.8 12 21.8 12 18.2 17.8 12 17.8 2.2 12 2.2 12z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"></path><circle cx=\"12\" cy=\"12\" r=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"></circle></svg>"
    + "<svg class=\"eye-shut\" viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" aria-hidden=\"true\"><path d=\"M3 3.5l18 17\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path><path d=\"M10.4 6.4A11 11 0 0 1 12 6.2c6.2 0 9.8 5.8 9.8 5.8a18 18 0 0 1-3.3 3.7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path><path d=\"M6.2 8.3A18 18 0 0 0 2.2 12S5.8 17.8 12 17.8a11 11 0 0 0 4.1-.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path><path d=\"M9.8 10a2.5 2.5 0 0 0 3.5 3.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path></svg>"
    + "</button></div></div>"
    + "<p id=\"auth-status\" class=\"orders-note\" role=\"status\"></p>"
    + "<button type=\"submit\" class=\"btn btn--gold\" id=\"auth-login\">התחברות</button>"
    + "<button type=\"button\" class=\"btn btn--ghost\" id=\"auth-close\">המשך ללא התחברות</button>"
    + "<p class=\"auth-switch\"><button type=\"button\" id=\"auth-signup\">עדיין לא רשומים? הירשמו עכשיו</button></p>"
    + "</form>";
  document.body.appendChild(dialog);

  var adminNote = document.createElement("section");
  var adminNoteText = document.createElement("p");
  var adminNoteLink = document.createElement("a");
  var adminNoteOut = document.createElement("button");
  var adminNoteHome = document.querySelector("main");
  adminNote.className = "admin-customer-note";
  adminNote.hidden = true;
  adminNote.setAttribute("aria-label", "חשבון מנהל");
  adminNoteText.textContent = "אתם מחוברים כמנהל. אזור הלקוחות לא מציג את החשבון הזה כלקוח, ולא מאפשר הזמנה או פעולות לקוח.";
  adminNoteLink.className = "btn btn--gold";
  adminNoteLink.href = "admin/";
  adminNoteLink.textContent = "לאזור הניהול";
  adminNoteOut.type = "button";
  adminNoteOut.className = "btn btn--ghost";
  adminNoteOut.textContent = "התנתקות";
  adminNote.appendChild(adminNoteText);
  adminNote.appendChild(adminNoteLink);
  adminNote.appendChild(adminNoteOut);
  if (adminNoteHome) {
    adminNoteHome.insertBefore(adminNote, adminNoteHome.firstChild);
  } else {
    document.body.appendChild(adminNote);
  }
  adminNoteOut.addEventListener("click", function () {
    authButton.click();
  });

  var form = dialog.querySelector("#auth-form");
  var usernameInput = dialog.querySelector("#auth-username");
  var passwordInput = dialog.querySelector("#auth-password");
  var status = dialog.querySelector("#auth-status");
  var eye = dialog.querySelector("#auth-eye");
  var hint = dialog.querySelector("#auth-hint");
  var title = dialog.querySelector("#auth-title");
  var loginButton = dialog.querySelector("#auth-login");
  var signupButton = dialog.querySelector("#auth-signup");
  var closeButton = dialog.querySelector("#auth-close");
  var authMode = "login";

  function setMode(next) {
    authMode = next === "signup" ? "signup" : "login";
    if (hint) {
      hint.hidden = authMode !== "signup";
    }
    if (title) {
      title.textContent = authMode === "signup" ? "הרשמה" : "התחברות";
    }
    if (loginButton) {
      loginButton.textContent = authMode === "signup" ? "הרשמה" : "התחברות";
    }
    if (closeButton) {
      closeButton.hidden = authMode === "signup";
    }
    if (signupButton) {
      signupButton.textContent = authMode === "signup" ? "רשומים כבר אצלנו? לחצו כאן להתחבר" : "עדיין לא רשומים? הירשמו עכשיו";
    }
  }

  function say(text) {
    if (status) {
      status.textContent = text || "";
    }
  }

  function headerName(profile) {
    return profile ? String(profile.first_name || profile.full_name || "").trim() : "";
  }

  function paint(session, profile) {
    var admin = !!(session && session.user && profile && profile.role === "admin");
    activeSession = session && session.user ? session : null;
    var name = activeSession ? headerName(profile) : "";
    window.VIP_ADMIN_CUSTOMER = admin;
    document.body.classList.toggle("admin-as-customer", admin);
    adminNote.hidden = !admin;
    if (admin) {
      userLabel.hidden = false;
      userLabel.textContent = "מחובר כמנהל";
      authButton.textContent = "התנתקות";
      if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.stop) {
        window.VIP_HOLD_UI.stop();
      }
      return;
    }
    userLabel.hidden = !name;
    userLabel.textContent = name;
    authButton.textContent = activeSession ? "התנתקות" : "התחברות";
  }

  window.addEventListener("vip-profile-saved", function () {
    if (!activeSession || !auth.profile) {
      return;
    }
    var generation = accountGeneration;
    auth.profile().then(function (loaded) {
      if (generation === accountGeneration && activeSession) {
        paint(activeSession, loaded && loaded.profile);
      }
    });
  });

  function refreshOrders(session) {
    if (!document.getElementById("orders-list") || !window.VIP_ORDERS || !window.VIP_ORDERS.showAccount) {
      return;
    }
    window.VIP_ORDERS.showAccount(session);
  }

  function openModal(after, message) {
    pending = typeof after === "function" ? after : null;
    setMode("login");
    say(message || "");
    clearLoginFields();
    window.setTimeout(clearLoginFields, 80);
    if (passwordInput) {
      passwordInput.setAttribute("type", "password");
    }
    if (eye) {
      eye.setAttribute("aria-pressed", "false");
      eye.setAttribute("aria-label", "הצגת הסיסמה");
    }
    if (dialog.showModal && !dialog.open) {
      dialog.showModal();
    }
  }

  function finish(session, profile) {
    var done = pending;
    var admin = !!(profile && profile.role === "admin");
    pending = null;
    paint(session, profile);
    if (passwordInput) {
      passwordInput.value = "";
    }
    if (dialog.open) {
      dialog.close();
    }
    if (admin) {
      refreshOrders(null);
      return;
    }
    refreshOrders(session);
    if (done) {
      done();
    }
  }

  function credentials() {
    var username = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
    var password = passwordInput ? passwordInput.value : "";
    if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) {
      return null;
    }
    if (!password || password.length < 6) {
      say("הסיסמה צריכה 6 תווים לפחות.");
      return null;
    }
    return { username: username, password: password };
  }

  function run(action) {
    var fields = credentials();
    var method = action === "signUp" ? "signUpWithUsername" : "signInWithUsername";
    if (!fields || !auth[method]) {
      if (fields && !auth[method]) {
        say("אין חיבור כרגע. נסו שוב בעוד רגע.");
      }
      return;
    }
    say("בודק את הפרטים…");
    auth[method](fields.username, fields.password).then(function (result) {
      if (!result || result.error || !result.session) {
        say(result && result.error ? result.error : (result && result.needsConfirm ? "החשבון נפתח, אבל צריך לאשר אותו לפני ההתחברות." : "הפעולה נכשלה."));
        return;
      }
      if (auth.profile) {
        auth.profile().then(function (loaded) {
          finish(result.session, loaded && loaded.profile);
        });
        return;
      }
      finish(result.session);
    }).catch(function () {
      say("הפעולה נכשלה.");
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    run(authMode === "signup" ? "signUp" : "signIn");
  });
  signupButton.addEventListener("click", function () {
    setMode(authMode === "signup" ? "login" : "signup");
    say("");
  });
  dialog.querySelector("#auth-close").addEventListener("click", function () {
    pending = null;
    dialog.close();
  });
  dialog.addEventListener("cancel", function () {
    pending = null;
  });
  if (eye && passwordInput) {
    eye.addEventListener("click", function () {
      var revealed = passwordInput.getAttribute("type") === "text";
      passwordInput.setAttribute("type", revealed ? "password" : "text");
      eye.setAttribute("aria-pressed", revealed ? "false" : "true");
      eye.setAttribute("aria-label", revealed ? "הצגת הסיסמה" : "הסתרת הסיסמה");
    });
  }
  authButton.addEventListener("click", function () {
    if (activeSession && auth.signOut) {
      accountGeneration += 1;
      auth.signOut().then(function () {
        paint(null, null);
        refreshOrders(null);
      });
      return;
    }
    openModal();
  });

  function blankLoginField(input) {
    if (!input) {
      return;
    }
    input.setAttribute("readonly", "readonly");
    input.value = "";
    input.addEventListener("focus", function () {
      input.removeAttribute("readonly");
    });
  }

  function clearLoginFields() {
    if (document.activeElement !== usernameInput && usernameInput) {
      usernameInput.value = "";
    }
    if (document.activeElement !== passwordInput && passwordInput) {
      passwordInput.value = "";
    }
  }

  blankLoginField(usernameInput);
  blankLoginField(passwordInput);
  window.setTimeout(clearLoginFields, 80);
  window.setTimeout(clearLoginFields, 600);

  function remember(session, profile) {
    var admin = !!(session && session.user && profile && profile.role === "admin");
    paint(session, profile);
    if (admin) {
      pending = null;
      refreshOrders(null);
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    refreshOrders(session);
    if (session && session.user && dialog.open && !pending) {
      dialog.close();
    }
  }

  window.VIP_AUTH = { open: openModal };

  if (auth.watchAuth) {
    auth.watchAuth(function (event, session) {
      var generation;
      if (event === "SIGNED_OUT") {
        accountGeneration += 1;
        paint(null, null);
        refreshOrders(null);
        return;
      }
      if (!session || !session.user) {
        return;
      }
      if (event === "TOKEN_REFRESHED" && activeSession && activeSession.user && session.user.id === activeSession.user.id) {
        activeSession = session;
        return;
      }
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") && auth.profile) {
        accountGeneration += 1;
        generation = accountGeneration;
        auth.profile().then(function (loaded) {
          if (generation !== accountGeneration) {
            return;
          }
          remember(session, loaded && loaded.profile);
        });
      }
    });
  }

  function boot() {
    var generation;
    if (!auth.session) {
      if (document.body.classList.contains("home")) {
        openModal();
      }
      return;
    }
    accountGeneration += 1;
    generation = accountGeneration;
    auth.session().then(function (result) {
      if (generation !== accountGeneration) {
        return null;
      }
      if (result && result.session) {
        if (auth.profile) {
          return auth.profile().then(function (loaded) {
            if (generation !== accountGeneration) {
              return null;
            }
            remember(result.session, loaded && loaded.profile);
            return null;
          });
        }
        remember(result.session, null);
        return null;
      }
      refreshOrders(null);
      if (document.body.classList.contains("home") || document.getElementById("orders-list")) {
        openModal(null, document.getElementById("orders-list") ? "כדי לראות את ההזמנות צריך להתחבר." : "");
      }
      return null;
    }).catch(function () {
      refreshOrders(null);
      if (document.body.classList.contains("home") || document.getElementById("orders-list")) {
        openModal(null, document.getElementById("orders-list") ? "כדי לראות את ההזמנות צריך להתחבר." : "");
      }
    });
  }

  if (auth.whenReady) {
    auth.whenReady().then(boot);
  } else {
    boot();
  }
})();

(function () {
  "use strict";

  var promptBox = document.getElementById("install-prompt");
  if (!promptBox) {
    return;
  }

  var storageKey = "vip-install-choice";
  var deferred = null;
  var yes = document.getElementById("install-yes");
  var no = document.getElementById("install-no");

  function remembered() {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch (error) {
      return "";
    }
  }

  function remember(value) {
    try {
      localStorage.setItem(storageKey, value);
    } catch (error) {
      return;
    }
  }

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true;
  }

  function hide() {
    promptBox.hidden = true;
  }

  function alreadyInstalled() {
    return isInstalled() || remembered() === "installed";
  }

  function show() {
    if (alreadyInstalled()) {
      hide();
      return;
    }
    promptBox.hidden = false;
    if (yes) {
      yes.focus();
    }
  }

  if (isInstalled()) {
    remember("installed");
    return;
  }

  if (alreadyInstalled()) {
    return;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferred = event;
  });

  window.addEventListener("appinstalled", function () {
    remember("installed");
    hide();
  });

  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(function (apps) {
      var found = apps && apps.some(function (app) {
        return app.platform === "webapp";
      });
      if (found) {
        remember("installed");
        hide();
        return;
      }
      show();
    }).catch(function () {
      show();
    });
  } else {
    show();
  }

  no.addEventListener("click", hide);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hide();
    }
  });
  yes.addEventListener("click", function () {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        deferred = null;
        if (choice && choice.outcome === "accepted") {
          remember("installed");
        }
        hide();
      });
      return;
    }
    var ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    var note = document.createElement("p");
    note.textContent = ios
      ? "באייפון: לחצו על כפתור השיתוף בדפדפן, ואז על „הוסף למסך הבית”."
      : "אם הדפדפן מציע התקנה, היא נמצאת בתפריט הדפדפן: התקנת אפליקציה או הוספה למסך הבית.";
    yes.parentNode.parentNode.insertBefore(note, yes.parentNode);
    yes.hidden = true;
  });
})();

(function () {
  "use strict";

  var box = document.getElementById("notify-prompt");
  var install = document.getElementById("install-prompt");
  if (!box) {
    return;
  }

  // Admin and customer share one origin, so "later" is kept per app and only
  // for the current visit. A browser block is read from Notification.permission.
  var storageKey = "vip-notify-later-" + (document.body.classList.contains("admin") ? "admin" : "customer");
  var yes = document.getElementById("notify-yes");
  var later = document.getElementById("notify-later");
  var text = document.getElementById("notify-text");
  var shown = false;

  function remembered() {
    try {
      return sessionStorage.getItem(storageKey) || "";
    } catch (error) {
      return "";
    }
  }

  function remember(value) {
    try {
      sessionStorage.setItem(storageKey, value);
    } catch (error) {
      return;
    }
  }

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true;
  }

  function permission() {
    if (!("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  }

  function iosBrowser() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !standalone();
  }

  function pushAudience() {
    return document.body.classList.contains("admin") ? "admin" : "customer";
  }

  function pushSupported() {
    return ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);
  }

  function blockedReason() {
    if (!pushSupported()) {
      return "הדפדפן הזה לא תומך בהתראות, ולכן אי אפשר להפעיל אותן כאן.";
    }
    if (iosBrowser()) {
      return "באייפון ההתראות זמינות רק אחרי הוספת האתר למסך הבית ופתיחתו מהאייקון.";
    }
    return "";
  }

  function shouldOffer() {
    var state = permission();
    return remembered() !== "later" && state !== "denied" && state !== "unsupported";
  }

  function keyBytes(value) {
    var remainder = value.length % 4;
    var padded = remainder === 0 ? value : value + "====".slice(remainder);
    var standard = padded.replace(/-/g, "+").replace(/_/g, "/");
    var binary = window.atob(standard);
    var bytes = new Uint8Array(binary.length);
    var index;
    for (index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  var deniedText = "הדפדפן חסם את ההתראות. אפשר לשנות זאת בהגדרות הדפדפן.";
  var prepared = null;

  function logPushError(step, error) {
    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("VIP push: " + step + " failed", error && error.name ? error.name : "Error", error && error.message ? error.message : String(error || ""));
    }
  }

  function subscribeMessage(error) {
    var name = error && error.name ? error.name : "";
    if (name === "NotAllowedError") {
      return "הדפדפן לא אישר הרשמה להתראות. ודאו שההתראות מותרות לאפליקציה ונסו שוב.";
    }
    if (name === "AbortError") {
      return "שירות ההתראות של הדפדפן לא זמין כרגע. נסו שוב בעוד רגע.";
    }
    if (name === "InvalidStateError") {
      return "רכיב ההתראות עדיין נטען. נסו שוב בעוד רגע.";
    }
    return "ההרשמה להתראות נכשלה" + (name ? " (" + name + ")" : "") + ". נסו שוב.";
  }

  // Everything async happens here, before the click, so the click can call
  // pushManager.subscribe() first while the user gesture is still valid.
  function loadPushSetup(audience) {
    var auth = window.VIP_SUPABASE;
    if (!auth || !auth.profile || !auth.vapidPublicKey || !auth.preparePushRegistration || !auth.savePushSubscription) {
      return Promise.resolve({ ok: false, error: "אין חיבור כרגע. נסו שוב בעוד רגע." });
    }
    return auth.profile().then(function (loaded) {
      var role = loaded && loaded.profile ? loaded.profile.role : "";
      if (!loaded || !loaded.session) {
        return { ok: false, error: "כדי להפעיל התראות צריך להתחבר." };
      }
      if (audience === "admin" && role !== "admin") {
        return { ok: false, error: "התראות הניהול זמינות רק למנהל." };
      }
      if (audience === "customer" && role === "admin") {
        return { ok: false, error: "התראות ללקוח לא נרשמות מחשבון מנהל. הן מופעלות באפליקציית הניהול." };
      }
      return auth.vapidPublicKey().then(function (keyResult) {
        if (!keyResult || !keyResult.publicKey) {
          return { ok: false, error: "אי אפשר לקבל את מפתח ההתראות מהשרת. נסו שוב בעוד רגע." };
        }
        return auth.preparePushRegistration(audience).then(function (registration) {
          if (!registration || !registration.pushManager) {
            return { ok: false, error: "אי אפשר לרשום את רכיב ההתראות בדפדפן. נסו שוב בעוד רגע." };
          }
          return { ok: true, audience: audience, registration: registration, key: keyBytes(keyResult.publicKey) };
        });
      });
    }).catch(function (error) {
      logPushError("prepare", error);
      return { ok: false, error: "אי אפשר להכין את ההתראות כרגע. נסו שוב בעוד רגע." };
    });
  }

  function preparePush() {
    var audience = pushAudience();
    if (prepared && prepared.audience === audience) {
      return prepared.promise;
    }
    var entry = { audience: audience, ready: null, promise: null };
    prepared = entry;
    entry.promise = loadPushSetup(audience).then(function (result) {
      entry.ready = result;
      if (!result.ok && prepared === entry) {
        prepared = null;
      }
      return result;
    });
    return entry.promise;
  }

  function preparedNow() {
    if (prepared && prepared.audience === pushAudience() && prepared.ready && prepared.ready.ok) {
      return prepared.ready;
    }
    return null;
  }

  function subscribeWith(ready) {
    var manager = ready.registration.pushManager;
    var options = { userVisibleOnly: true, applicationServerKey: ready.key };
    return manager.subscribe(options).catch(function (error) {
      if (!error || error.name !== "InvalidStateError") {
        throw error;
      }
      // A subscription made with an older VAPID key blocks a new one.
      return manager.getSubscription().then(function (old) {
        if (!old) {
          throw error;
        }
        return old.unsubscribe().then(function () {
          return manager.subscribe(options);
        });
      });
    }).then(function (subscription) {
      var auth = window.VIP_SUPABASE;
      return auth.savePushSubscription(ready.audience, subscription).then(function (saved) {
        if (!saved || !saved.conflict) {
          return saved;
        }
        // The endpoint is still stored for another account that used this
        // device, so a fresh endpoint is created for the signed-in account.
        return subscription.unsubscribe().then(function () {
          return manager.subscribe(options);
        }).then(function (fresh) {
          return auth.savePushSubscription(ready.audience, fresh);
        });
      }).catch(function (error) {
        logPushError("save", error);
        return { ok: false, error: "ההרשמה נוצרה בדפדפן אבל לא נשמרה בשרת. נסו שוב." };
      });
    }, function (error) {
      logPushError("subscribe", error);
      if (permission() === "denied") {
        return { ok: false, denied: true, error: deniedText };
      }
      return { ok: false, error: subscribeMessage(error) };
    });
  }

  function hide() {
    box.hidden = true;
  }

  function show() {
    if (shown || !shouldOffer()) {
      return;
    }
    shown = true;
    var reason = blockedReason();
    if (reason && text) {
      text.textContent = reason;
    }
    if (reason && yes) {
      yes.hidden = true;
    }
    box.hidden = false;
    if (yes && !yes.hidden) {
      yes.focus();
      preparePush();
    } else if (later) {
      later.focus();
    }
  }

  // The install prompt can open after this runs, so the two never stack:
  // notifications step aside while it is open and return once it closes.
  var installWatched = false;

  function offerAfterInstall() {
    if (install && !installWatched) {
      installWatched = true;
      new MutationObserver(function () {
        if (!install.hidden) {
          if (!box.hidden) {
            box.hidden = true;
            shown = false;
          }
          return;
        }
        show();
      }).observe(install, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (install && !install.hidden) {
      return;
    }
    show();
  }

  // Offers the prompt only to the account this app is for. When the browser
  // already holds a subscription for this app, it is saved again silently so
  // the server row exists without asking the user a second time.
  function decide() {
    var auth = window.VIP_SUPABASE;
    var audience = pushAudience();
    if (shown || !shouldOffer() || !auth || !auth.profile) {
      return;
    }
    auth.profile().then(function (loaded) {
      var role = loaded && loaded.profile ? loaded.profile.role : "";
      if (!loaded || !loaded.session || shown) {
        return null;
      }
      if (audience === "admin" ? role !== "admin" : role === "admin") {
        return null;
      }
      if (permission() !== "granted" || !auth.pushSubscription) {
        offerAfterInstall();
        return null;
      }
      return auth.pushSubscription(audience).then(function (current) {
        if (!current) {
          offerAfterInstall();
          return null;
        }
        return auth.savePushSubscription(audience, current.subscription).then(function (saved) {
          if (!saved || !saved.ok) {
            offerAfterInstall();
          }
        });
      });
    }).catch(function (error) {
      logPushError("check", error);
    });
  }

  if (later) {
    later.addEventListener("click", function () {
      remember("later");
      hide();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !box.hidden) {
      remember("later");
      hide();
    }
  });

  if (yes) {
    yes.addEventListener("click", function () {
      var reason = blockedReason();
      if (reason) {
        if (text) {
          text.textContent = reason;
        }
        return;
      }
      if (permission() === "denied") {
        if (text) {
          text.textContent = deniedText;
        }
        yes.hidden = true;
        return;
      }
      // subscribe() asks for permission itself, so it runs first inside the click.
      var ready = preparedNow();
      var subscribing = ready ? subscribeWith(ready) : preparePush().then(function (result) {
        return result.ok ? subscribeWith(result) : result;
      });
      if (text) {
        text.textContent = "שומר את ההתראות…";
      }
      subscribing.then(function (saved) {
        if (saved && saved.ok) {
          hide();
          return;
        }
        if (saved && saved.denied) {
          yes.hidden = true;
        }
        if (text) {
          text.textContent = saved && saved.error ? saved.error : "אי אפשר להפעיל התראות כרגע.";
        }
      }, function (error) {
        logPushError("enable", error);
        if (text) {
          text.textContent = "אי אפשר להפעיל התראות כרגע.";
        }
      });
    });
  }

  if (window.VIP_SUPABASE && typeof window.VIP_SUPABASE.watchAuth === "function") {
    window.VIP_SUPABASE.watchAuth(function (event) {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") {
        return;
      }
      prepared = null;
      if (event === "SIGNED_OUT") {
        hide();
        shown = false;
        return;
      }
      if (!box.hidden && yes && !yes.hidden) {
        preparePush();
        return;
      }
      if (!document.body.classList.contains("admin-locked")) {
        decide();
      }
    });
  }

  function offerWhenReady() {
    if (!standalone() && (iosBrowser() || !pushSupported())) {
      return;
    }
    if (document.body.classList.contains("admin") && document.body.classList.contains("admin-locked")) {
      var observer = new MutationObserver(function () {
        if (!document.body.classList.contains("admin-locked")) {
          observer.disconnect();
          decide();
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      return;
    }
    decide();
  }

  offerWhenReady();
})();

(function () {
  "use strict";

  if (document.body.classList.contains("admin")) {
    return;
  }
  var file = window.location.pathname.split("/").pop() || "";
  var booking = window.VIP_BOOKING;
  var auth = window.VIP_SUPABASE;

  function clearToken() {
    try {
      sessionStorage.removeItem("vip-hold-id");
    } catch (error) {
      return;
    }
  }

  function remember(id) {
    try {
      if (id) {
        sessionStorage.setItem("vip-hold-id", id);
      } else {
        sessionStorage.removeItem("vip-hold-id");
      }
    } catch (error) {
      return;
    }
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    var link = null;
    var raw = "";
    var path = "";
    var name = "";
    var converted = false;
    while (node && node !== document) {
      if (node.tagName === "A") {
        link = node;
        break;
      }
      node = node.parentNode;
    }
    if (!link) {
      return;
    }
    raw = link.getAttribute("href") || "";
    if (!raw || raw.indexOf("mailto:") === 0 || raw.indexOf("tel:") === 0 || raw.indexOf("http") === 0) {
      return;
    }
    path = raw.split("#")[0].split("?")[0];
    name = path.split("/").pop();
    if (name !== "index.html" && name !== "orders.html" && name !== "booking.html" && name !== "booking-next.html") {
      return;
    }
    if (name === "booking-next.html" && file === "booking-next.html") {
      return;
    }
    try {
      converted = !!window.VIP_HOLD_CONVERTED || sessionStorage.getItem("vip-hold-converted") === "1";
    } catch (error) {
      converted = !!window.VIP_HOLD_CONVERTED;
    }
    if (converted) {
      return;
    }
    clearToken();
    if (window.VIP_HOLD_UI && window.VIP_HOLD_UI.stop) {
      window.VIP_HOLD_UI.stop();
    }
    if (window.VIP_HOLD_LEAVE) {
      window.VIP_HOLD_LEAVE();
      return;
    }
    if (auth && auth.releaseHold) {
      auth.releaseHold();
    }
  });

  if (file === "booking.html" || file === "index.html" || file === "orders.html") {
    var converted = false;
    try {
      converted = sessionStorage.getItem("vip-hold-converted") === "1";
      sessionStorage.removeItem("vip-hold-converted");
    } catch (error) {
      converted = false;
    }
    if (!converted) {
      clearToken();
      if (auth && auth.releaseHold) {
        auth.releaseHold();
      }
    }
    return;
  }
  if ((file !== "booking-details.html" && file !== "booking-summary.html" && file !== "booking-next.html") || !booking) {
    return;
  }

  var draft = booking.read();
  var people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
  var status = document.getElementById("hold-status") || document.getElementById("send-status");
  var sendButton = document.getElementById("send-request");
  var timer = document.createElement("div");
  var face = document.createElement("span");
  var tick = 0;
  var expiresMs = 0;
  var clockSkew = 0;

  timer.className = "hold-timer";
  timer.hidden = true;
  timer.setAttribute("role", "timer");
  timer.setAttribute("aria-label", "הזמן שנותר להזמנה");
  timer.appendChild(face);
  document.body.appendChild(timer);

  var clockGeneration = 0;

  function stopClock() {
    clockGeneration += 1;
    if (tick) {
      window.clearInterval(tick);
      tick = 0;
    }
    timer.hidden = true;
  }

  function setStatus(text) {
    if (window.VIP_SENDING) {
      return;
    }
    if (status) {
      status.textContent = text || "";
    }
  }

  function showReselect() {
    var link = document.getElementById("hold-reselect");
    if (file === "booking-next.html") {
      return;
    }
    if (!link) {
      link = document.createElement("a");
      link.id = "hold-reselect";
      link.className = "btn btn--ghost";
      link.textContent = "לבחירת שעה מחדש";
      if (status && status.parentNode) {
        status.parentNode.insertBefore(link, status.nextSibling);
      }
    }
    link.href = "booking-next.html?release=1";
    link.textContent = "לבחירת שעה מחדש";
  }

  function publish(state) {
    var nextButton = document.getElementById("details-continue");
    var allow = !!(state.matches && !state.blocked && !state.pending && !state.expired);
    window.VIP_SLOT_HOLD = state;
    if (sendButton && !sendButton.hidden && !window.VIP_SENDING) {
      sendButton.disabled = !allow;
    }
    if (state.blocked || state.expired) {
      if (nextButton) {
        nextButton.disabled = true;
      }
    }
    if (typeof window.VIP_HOLD_WATCH === "function") {
      window.VIP_HOLD_WATCH();
    }
  }

  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function expireHold() {
    var converted = false;
    try {
      converted = sessionStorage.getItem("vip-hold-converted") === "1" || !!window.VIP_HOLD_CONVERTED;
    } catch (error) {
      converted = !!window.VIP_HOLD_CONVERTED;
    }
    if (converted || window.VIP_SENDING) {
      return;
    }
    clearToken();
    stopClock();
    if (typeof window.VIP_HOLD_ON_EXPIRE === "function") {
      window.VIP_HOLD_ON_EXPIRE();
    }
    if (window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
      window.VIP_BOOKING.abandonExpired();
    }
  }

  function remainingSeconds() {
    if (!expiresMs) {
      return null;
    }
    return Math.floor((expiresMs - (Date.now() + clockSkew)) / 1000);
  }

  function paint(generation) {
    var seconds = remainingSeconds();
    if (generation !== clockGeneration) {
      return;
    }
    if (seconds === null || seconds <= 0) {
      expireHold();
      return;
    }
    face.textContent = pad(Math.floor(seconds / 60)) + ":" + pad(seconds % 60);
    timer.classList.toggle("is-late", seconds < 60);
    timer.hidden = false;
  }

  function startClock(value, serverNow, replace) {
    var parsed = Date.parse(value);
    var serverParsed = Date.parse(serverNow || "");
    var generation;
    if (isNaN(parsed)) {
      return;
    }
    if (replace || !expiresMs || parsed <= expiresMs) {
      expiresMs = parsed;
    }
    if (!isNaN(serverParsed)) {
      clockSkew = serverParsed - Date.now();
    }
    generation = ++clockGeneration;
    if (tick) {
      window.clearInterval(tick);
      tick = 0;
    }
    paint(generation);
    if (generation !== clockGeneration) {
      return;
    }
    tick = window.setInterval(function () {
      paint(generation);
    }, 250);
  }

  function markExpired(expiresAt, serverNow) {
    var parsed = Date.parse(expiresAt || "");
    var serverParsed = Date.parse(serverNow || "");
    clockGeneration += 1;
    if (tick) {
      window.clearInterval(tick);
      tick = 0;
    }
    expiresMs = !isNaN(parsed) ? parsed : Date.now() - 1000;
    if (!isNaN(serverParsed)) {
      clockSkew = serverParsed - Date.now();
    }
    timer.hidden = true;
  }

  function same(hold) {
    return !!(hold && hold.date === draft.date && hold.time === String(draft.time || "").slice(0, 5) && Number(hold.adults) === Number(draft.adults) && Number(hold.children) === Number(draft.children) && Number(hold.beards) === Number(draft.beards));
  }

  function fresh(hold) {
    var expires = hold ? Date.parse(hold.expiresAt) : NaN;
    var serverNow = hold ? Date.parse(hold.serverNow || "") : NaN;
    if (!same(hold) || isNaN(expires)) {
      return false;
    }
    if (isNaN(serverNow)) {
      return false;
    }
    return expires > serverNow;
  }

  function confirm() {
    if (!auth || !auth.currentHold || !auth.currentBookingWindow || !auth.session) {
      return Promise.resolve({ ok: false, error: "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע." });
    }
    return auth.session().then(function (sessionResult) {
      if (!sessionResult || !sessionResult.session) {
        return { kind: "session", error: "צריך להתחבר לפני שליחת ההזמנה." };
      }
      return Promise.all([
        auth.currentBookingWindow(),
        auth.currentHold()
      ]).then(function (parts) {
        return { kind: "ready", deadline: parts[0], hold: parts[1] };
      });
    }).then(function (result) {
      var message = "";
      var deadline;
      var holdResult;
      if (result && result.kind === "session") {
        setStatus(result.error);
        publish({ pending: false, id: "", matches: false, blocked: false, expired: false, retry: false, unverified: true, message: result.error });
        return { ok: false, error: result.error };
      }
      deadline = result ? result.deadline : null;
      holdResult = result ? result.hold : null;
      if (!deadline || deadline.error || deadline.expired || !deadline.expiresAt) {
        message = deadline && deadline.error ? deadline.error : "עברו 10 הדקות להזמנה. בחרו שעה מחדש.";
        clearToken();
        if (deadline && deadline.expiresAt) {
          markExpired(deadline.expiresAt, deadline.serverNow);
        } else {
          stopClock();
        }
        setStatus(message);
        publish({ pending: false, id: "", matches: false, blocked: true, expired: true, retry: false, unverified: false, message: message });
        if (!deadline || !deadline.error) {
          if (window.VIP_BOOKING && window.VIP_BOOKING.abandonExpired) {
            window.VIP_BOOKING.abandonExpired();
          }
        }
        return { ok: false, error: message };
      }
      startClock(deadline.expiresAt, deadline.serverNow, true);
      if (holdResult && holdResult.error && holdResult.error.indexOf("להתחבר") !== -1) {
        setStatus(holdResult.error);
        publish({ pending: false, id: "", matches: false, blocked: false, expired: false, retry: false, unverified: true, message: holdResult.error });
        return { ok: false, error: holdResult.error };
      }
      if (!holdResult || holdResult.error) {
        message = holdResult && holdResult.error ? holdResult.error : "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.";
        setStatus(message);
        publish({ pending: false, id: "", matches: false, blocked: true, expired: false, retry: false, unverified: true, message: message });
        return { ok: false, error: message };
      }
      if (holdResult.hold && !same(holdResult.hold)) {
        clearToken();
        message = "השעה שנבחרה לא תואמת. בחרו שעה מחדש.";
        setStatus(message);
        showReselect();
        publish({ pending: false, id: "", matches: false, blocked: true, expired: false, retry: false, unverified: false, message: message });
        if (auth.releaseHold) {
          auth.releaseHold();
        }
        return { ok: false, error: message };
      }
      if (!fresh(holdResult.hold)) {
        clearToken();
        message = "הזמן לשמירת השעה הסתיים. בחרו שעה מחדש.";
        setStatus(message);
        showReselect();
        publish({ pending: false, id: "", matches: false, blocked: true, expired: false, retry: false, unverified: false, message: message });
        return { ok: false, error: message };
      }
      remember(holdResult.hold.id);
      setStatus("");
      publish({ pending: false, id: holdResult.hold.id, matches: true, blocked: false, expired: false, retry: false, unverified: false, message: "" });
      return { ok: true, hold: holdResult.hold };
    }).catch(function () {
      var message = "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.";
      setStatus(message);
      publish({ pending: false, id: "", matches: false, blocked: true, expired: false, retry: false, unverified: true, message: message });
      return { ok: false, error: message };
    });
  }

  window.VIP_HOLD_UI = {
    stop: stopClock,
    start: function (value, serverNow, replace) {
      if (people > 5) {
        return;
      }
      startClock(value, serverNow, replace);
    },
    markExpired: markExpired,
    remaining: remainingSeconds,
    confirm: confirm
  };

  if (people > 5) {
    clearToken();
    stopClock();
    publish({ pending: false, id: "", matches: false, blocked: false, expired: false, retry: false, unverified: false, message: "" });
    if (auth && auth.releaseHold) {
      auth.releaseHold();
    }
    return;
  }

  if (file === "booking-next.html") {
    return;
  }

  publish({ pending: true, id: "", matches: false, blocked: false, expired: false, retry: false, unverified: false, message: "" });
  if (!auth || !auth.currentHold) {
    var missing = "לא הצלחנו לשמור את השעה. נסו שוב בעוד רגע.";
    setStatus(missing);
    publish({ pending: false, id: "", matches: false, blocked: true, expired: false, retry: false, unverified: true, message: missing });
    return;
  }
  confirm();
})();
