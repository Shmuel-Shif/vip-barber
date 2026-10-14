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

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        return undefined;
      });
    });
  }
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
    photoKey: "vip-booking-entrance-photo",
    sentPhotoKey: "vip-booking-sent-photo"
  };
})();

(function () {
  "use strict";

  var storageKey = "vip-orders";

  function readOrders() {
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
      photo: order.photo || ""
    };
    if (window.VIP_SCHEDULE && window.VIP_SCHEDULE.slotOpen && !window.VIP_SCHEDULE.slotOpen(saved.date, saved.time)) {
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

  function approveOrder(id) {
    setOrderStatus(id, "approved");
  }

  function rejectOrder(id) {
    setOrderStatus(id, "rejected");
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

  function cancelOrder(id, meta) {
    var by = meta && meta.by === "customer" ? "customer" : "admin";
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
    customerMayCancel: customerMayCancel
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

  if (!party || !booking) {
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

  var adultPrice = numericPrice("mens-haircut");
  var childPrice = numericPrice("kids-haircut");
  var beardPrice = numericPrice("beard");

  if (adultRate) {
    adultRate.textContent = adultPrice === null ? "תספורת מבוגר" : "תספורת מבוגר, " + adultPrice + " ₪ לאדם";
  }
  if (childRate) {
    childRate.textContent = childPrice === null ? "תספורת ילד" : "תספורת ילד, " + childPrice + " ₪ לילד";
  }
  if (beardNote) {
    beardNote.textContent = beardPrice === null ? "וסידור זקן תוספת" : "וסידור זקן תוספת " + beardPrice + " ₪";
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

  continueLink.addEventListener("click", function (event) {
    if (continueLink.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  });

  paint();
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
  var continueButton = document.getElementById("cal-continue");
  var today = new Date();
  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

  var saved = parse(draft.date);
  if (!saved || saved < todayStart || isClosed(saved)) {
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
        draft.time = slot;
        save();
        render();
      });
      row.appendChild(button);
    });
    times.appendChild(row);
  }

  function render() {
    var year = view.getFullYear();
    var month = view.getMonth();
    label.textContent = months[month] + " " + year;
    prev.disabled = year === todayStart.getFullYear() && month === todayStart.getMonth();
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
      button.setAttribute("aria-label", index + " ב" + months[month] + " " + year);
      if (date < todayStart || isClosed(date)) {
        button.disabled = true;
        if (isClosed(date)) {
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

    renderTimes(parse(draft.date));
    if (continueButton) {
      var enough = booking.enoughPeople(draft);
      var ready = !!(draft.date && draft.time && enough);
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
  if (continueButton) {
    continueButton.addEventListener("click", function () {
      if (!draft.date || !draft.time || !booking.enoughPeople(draft)) {
        if (!booking.enoughPeople(draft)) {
          window.location.href = "booking.html";
        }
        return;
      }
      booking.write(draft);
      window.location.href = "booking-details.html";
    });
  }
  render();
})();

(function () {
  "use strict";

  var form = document.getElementById("customer-form");
  var booking = window.VIP_BOOKING;
  if (!form || !booking) {
    return;
  }

  var draft = booking.read();
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
    continueButton.disabled = !ok;
    continueButton.setAttribute("aria-disabled", ok ? "false" : "true");
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
          photoStatus.textContent = "לא ניתן להכין תצוגה מקדימה בדפדפן זה.";
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        var url = canvas.toDataURL("image/jpeg", 0.72);
        try {
          sessionStorage.setItem(booking.photoKey, url);
        } catch (error) {
          photoStatus.textContent = "התמונה גדולה מדי לשמירה בדפדפן. אפשר לבחור תמונה קטנה יותר.";
          return;
        }
        photoStatus.textContent = "התמונה נשמרה במכשיר הזה בלבד.";
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
    photoStatus.textContent = "התמונה הוסרה מהמכשיר הזה.";
    showPhoto("");
  });

  try {
    showPhoto(sessionStorage.getItem(booking.photoKey) || "");
  } catch (error) {
    showPhoto("");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
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
    var approvalModal = document.getElementById("approval-modal");
    if (approvalModal && approvalModal.showModal && !approvalModal.open) {
      approvalModal.showModal();
      return;
    }
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
  });

  var approvalContinue = document.getElementById("approval-continue");
  if (approvalContinue) {
    approvalContinue.addEventListener("click", function () {
      form.requestSubmit();
    });
  }

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
    image.alt = "תמונת הכניסה לבניין שנשמרה במכשיר";
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
  var modal = document.getElementById("sent-modal");
  var closeModal = document.getElementById("sent-close");

  button.addEventListener("click", function () {
    if (!booking.enoughPeople(draft)) {
      window.location.href = "booking.html";
      return;
    }
    var photo = "";
    booking.write(draft);
    try {
      photo = sessionStorage.getItem(booking.sentPhotoKey) || "";
    } catch (error) {
      photo = "";
    }
    if (window.VIP_ORDERS) {
      var created = window.VIP_ORDERS.add({
        adults: draft.adults,
        children: draft.children,
        vip: draft.vip,
        beards: draft.beards,
        date: draft.date,
        time: draft.time,
        customer: draft.submitted && (draft.submitted.fullName || draft.submitted.phone) ? draft.submitted : draft.customer,
        photo: photo
      });
      if (!created) {
        draft.time = "";
        booking.write(draft);
        window.location.href = "booking-next.html";
        return;
      }
    }
    if (modal && modal.showModal) {
      modal.showModal();
    }
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
  if (!file || file === "index.html") {
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

  function paint(target, canApprove) {
    var items = orders.read();
    target.textContent = "";
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "orders-empty";
      empty.textContent = "אין עדיין הזמנות.";
      target.appendChild(empty);
      return;
    }
    items.forEach(function (order) {
      var customer = order.customer || {};
      var card = document.createElement("article");
      var status = document.createElement("p");
      var when = document.createElement("p");
      var who = document.createElement("p");
      var where = document.createElement("p");
      var service = document.createElement("p");
      card.className = "order-card";
      status.className = "order-card__status is-" + (order.status === "approved" || order.status === "rejected" || order.status === "cancelled" ? order.status : "pending");
      status.textContent = order.status === "approved" ? "מאושר" : order.status === "rejected" ? "נדחה" : order.status === "cancelled" ? "בוטל" : "ממתין";
      when.textContent = dateLabel(order.date) + (order.time ? ", בשעה " + order.time : "");
      who.textContent = (customer.fullName || "ללא שם") + (customer.phone ? " · " + customer.phone : "");
      where.textContent = addressOf(customer);
      service.textContent = counts(order);
      card.appendChild(status);
      card.appendChild(when);
      card.appendChild(service);
      card.appendChild(who);
      card.appendChild(where);
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
          orders.approve(order.id);
          paint(target, true);
        });
        card.appendChild(approve);
      }
      target.appendChild(card);
    });
  }

  if (list) {
    paint(list, false);
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

  if (confirmYes) {
    confirmYes.addEventListener("click", function () {
      var saved = orders.cancel(cancelId, { by: "customer" });
      if (!saved) {
        if (feedback) {
          feedback.textContent = "אי אפשר לבטל החל מ־7 שעות לפני התור.";
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
          feedback.textContent = "ההזמנה בוטלה במכשיר זה. התראה לזאבי עדיין לא נשלחת, והיא תחובר אחר כך.";
        }
      }
      cancelId = "";
      if (dialog && dialog.close) {
        dialog.close();
      }
      if (list) {
        paint(list, false);
      }
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

  var storageKey = "vip-notify-choice";
  var yes = document.getElementById("notify-yes");
  var later = document.getElementById("notify-later");
  var text = document.getElementById("notify-text");
  var shown = false;

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

  function blockedReason() {
    if (!("Notification" in window)) {
      return "הדפדפן הזה לא תומך בהתראות, ולכן אי אפשר להפעיל אותן כאן.";
    }
    if (iosBrowser()) {
      return "באייפון ההתראות זמינות רק אחרי הוספת האתר למסך הבית ופתיחתו מהאייקון.";
    }
    return "";
  }

  function shouldOffer() {
    var choice = remembered();
    var state = permission();
    if (choice === "later" || choice === "denied") {
      return false;
    }
    if (state === "granted" || state === "denied") {
      return false;
    }
    return true;
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
    } else if (later) {
      later.focus();
    }
  }

  function offerAfterInstall() {
    if (!standalone()) {
      return;
    }
    if (install && !install.hidden) {
      return;
    }
    show();
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
      Notification.requestPermission().then(function (result) {
        if (result === "granted") {
          remember("granted");
          hide();
          return;
        }
        if (result === "denied") {
          remember("denied");
          if (text) {
            text.textContent = "הדפדפן חסם את ההתראות. אפשר לשנות זאת בהגדרות הדפדפן.";
          }
          yes.hidden = true;
        }
      });
    });
  }

  if (!standalone()) {
    return;
  }
  offerAfterInstall();
})();
