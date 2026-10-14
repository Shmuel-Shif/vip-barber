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

  function readBookingDraft() {
    var empty = { serviceId: "", adults: 0, children: 0, vip: 0, beards: 0, date: "", time: "" };
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
        time: typeof data.time === "string" ? data.time : ""
      };
    } catch (error) {
      return empty;
    }
  }

  function writeBookingDraft(draft) {
    var people = wholeCount(draft.adults) + wholeCount(draft.children) + wholeCount(draft.vip);
    var beards = wholeCount(draft.beards);
    if (beards > people) {
      beards = people;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        serviceId: typeof draft.serviceId === "string" ? draft.serviceId : "",
        adults: wholeCount(draft.adults),
        children: wholeCount(draft.children),
        vip: wholeCount(draft.vip),
        beards: beards,
        date: typeof draft.date === "string" ? draft.date : "",
        time: typeof draft.time === "string" ? draft.time : ""
      }));
    } catch (error) {
      return;
    }
  }

  window.VIP_BOOKING = {
    read: readBookingDraft,
    write: writeBookingDraft
  };
})();

(function () {
  "use strict";

  var catalog = document.getElementById("service-catalog");
  var status = document.getElementById("service-selection");
  if (!catalog || !status) {
    return;
  }

  var data = window.VIP_DEMO;
  var services = data && data.services ? data.services : [];
  var selectedId = "";
  var booking = window.VIP_BOOKING;

  function priceLabel(service) {
    if (service.priceOnRequest || service.priceIls === null || service.priceIls === undefined) {
      return "מחיר בתיאום";
    }
    return service.priceIls + " ₪";
  }

  function paintSelection() {
    var cards = catalog.querySelectorAll(".service-card");
    Array.prototype.forEach.call(cards, function (card) {
      var on = card.getAttribute("data-service-id") === selectedId;
      card.classList.toggle("is-selected", on);
      var button = card.querySelector("button");
      if (button) {
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
    });

    if (booking) {
      var draft = booking.read();
      draft.serviceId = selectedId;
      booking.write(draft);
    }

    if (!selectedId) {
      status.textContent = "";
      return;
    }

    var chosen = null;
    services.forEach(function (service) {
      if (service.id === selectedId) {
        chosen = service;
      }
    });

    if (!chosen) {
      status.textContent = "";
      return;
    }

    status.textContent = "נבחר: " + chosen.name;
  }

  var listed = services.filter(function (service) {
    return !service.addon;
  });

  if (!listed.length) {
    var empty = document.createElement("p");
    empty.className = "services-fallback";
    empty.textContent = "רשימת השירותים לא זמינה כרגע.";
    catalog.appendChild(empty);
    return;
  }

  listed.forEach(function (service) {
    var card = document.createElement("article");
    card.className = "service-card";
    card.setAttribute("data-service-id", service.id);

    var title = document.createElement("h2");
    title.textContent = service.name;

    var summary = document.createElement("p");
    summary.className = "service-card__summary";
    summary.textContent = service.summary || "";

    var price = document.createElement("p");
    price.className = "service-card__price";
    if (service.priceOnRequest || service.priceIls === null || service.priceIls === undefined) {
      price.classList.add("service-card__price--request");
    }
    price.textContent = priceLabel(service);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--gold";
    button.textContent = "בחירת השירות";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "בחירת השירות: " + service.name);
    button.addEventListener("click", function () {
      selectedId = service.id;
      if (booking) {
        var draft = booking.read();
        draft.serviceId = service.id;
        if (service.id === "mens-haircut" && draft.adults < 1) {
          draft.adults = 1;
        }
        if (service.id === "kids-haircut" && draft.children < 1) {
          draft.children = 1;
        }
        if (service.id === "vip-package" && draft.vip < 1) {
          draft.vip = 1;
        }
        booking.write(draft);
      }
      paintSelection();
      window.location.href = "booking.html";
    });

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(price);
    card.appendChild(button);
    catalog.appendChild(card);
  });

  if (booking) {
    var saved = booking.read();
    var savedIsListed = listed.some(function (service) {
      return service.id === saved.serviceId;
    });
    if (savedIsListed) {
      selectedId = saved.serviceId;
      paintSelection();
    }
  }
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
      line("בחרו לפחות אדם אחד.");
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
  var vipCount = document.getElementById("vip-count");
  var beardsCount = document.getElementById("beards-count");
  var adultsMinus = document.getElementById("adults-minus");
  var adultsPlus = document.getElementById("adults-plus");
  var childrenMinus = document.getElementById("children-minus");
  var childrenPlus = document.getElementById("children-plus");
  var vipMinus = document.getElementById("vip-minus");
  var vipPlus = document.getElementById("vip-plus");
  var beardsMinus = document.getElementById("beards-minus");
  var beardsPlus = document.getElementById("beards-plus");
  var summary = document.getElementById("party-summary");
  var continueLink = document.getElementById("party-continue");
  var adultRate = document.getElementById("adult-rate");
  var childRate = document.getElementById("child-rate");
  var beardRate = document.getElementById("beard-rate");

  var adultPrice = numericPrice("mens-haircut");
  var childPrice = numericPrice("kids-haircut");
  var beardPrice = numericPrice("beard");

  if (adultRate) {
    adultRate.textContent = adultPrice === null ? "תספורת מבוגר" : "תספורת מבוגר, " + adultPrice + " ₪ לאדם";
  }
  if (childRate) {
    childRate.textContent = childPrice === null ? "תספורת ילד" : "תספורת ילד, " + childPrice + " ₪ לילד";
  }
  if (beardRate) {
    beardRate.textContent = beardPrice === null ? "תוספת" : "תוספת " + beardPrice + " ₪";
  }

  function paint() {
    var people = draft.adults + draft.children + draft.vip;
    if (draft.beards > people) {
      draft.beards = people;
    }
    booking.write(draft);
    draft = booking.read();

    adultsCount.textContent = String(draft.adults);
    childrenCount.textContent = String(draft.children);
    vipCount.textContent = String(draft.vip);
    beardsCount.textContent = String(draft.beards);
    adultsMinus.disabled = draft.adults < 1;
    childrenMinus.disabled = draft.children < 1;
    vipMinus.disabled = draft.vip < 1;
    beardsMinus.disabled = draft.beards < 1;
    beardsPlus.disabled = people < 1 || draft.beards >= people;

    fillSummary(summary, draft);

    var ready = draft.adults + draft.children + draft.vip > 0;
    continueLink.setAttribute("aria-disabled", ready ? "false" : "true");
    continueLink.tabIndex = ready ? 0 : -1;
  }

  function change(field, delta) {
    var people = draft.adults + draft.children + draft.vip;
    if (field === "beards" && delta > 0 && draft.beards >= people) {
      return;
    }
    draft[field] = Math.max(0, draft[field] + delta);
    paint();
  }

  adultsMinus.addEventListener("click", function () { change("adults", -1); });
  adultsPlus.addEventListener("click", function () { change("adults", 1); });
  childrenMinus.addEventListener("click", function () { change("children", -1); });
  childrenPlus.addEventListener("click", function () { change("children", 1); });
  vipMinus.addEventListener("click", function () { change("vip", -1); });
  vipPlus.addEventListener("click", function () { change("vip", 1); });
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
    var rule = schedule.standing ? schedule.standing[String(date.getDay())] : null;
    return !!(rule && rule.status === "closed");
  }

  function slotsFor(date) {
    if (!date || isClosed(date) || !schedule.standing) {
      return [];
    }
    var rule = schedule.standing[String(date.getDay())];
    if (!rule || rule.status !== "hours" || !rule.slots) {
      return [];
    }
    return rule.slots.slice();
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
      var ready = !!(draft.date && draft.time);
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
  render();
})();

(function () {
  "use strict";

  var root = document.getElementById("week-days");
  var schedule = window.VIP_SCHEDULE;
  if (!root || !schedule) {
    return;
  }

  var label = document.getElementById("week-label");
  var status = document.getElementById("week-status");
  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var today = new Date();
  var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
  var week = {};

  function two(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function iso(date) {
    return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate());
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(schedule.storageKey);
      var data = raw ? JSON.parse(raw) : {};
      return data && data.weeks ? data.weeks : {};
    } catch (error) {
      return {};
    }
  }

  function blankWeek() {
    var days = {};
    schedule.weekdays.forEach(function (day) {
      days[day.id] = { status: "unset", start: "", end: "" };
    });
    return days;
  }

  function loadWeek() {
    var stored = readStore()[iso(cursor)];
    week = blankWeek();
    if (!stored) {
      return;
    }
    schedule.weekdays.forEach(function (day) {
      var item = stored[day.id];
      if (!item) {
        return;
      }
      if (item.status === "closed" || item.status === "hours" || item.status === "unset") {
        week[day.id].status = item.status;
      }
      week[day.id].start = typeof item.start === "string" ? item.start : "";
      week[day.id].end = typeof item.end === "string" ? item.end : "";
    });
  }

  function render() {
    var end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6);
    label.textContent = cursor.getDate() + " ב" + months[cursor.getMonth()] + " – " + end.getDate() + " ב" + months[end.getMonth()] + " " + end.getFullYear();
    root.textContent = "";
    schedule.weekdays.forEach(function (day) {
      var date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + Number(day.id));
      var card = document.createElement("article");
      card.className = "avail__day";

      var title = document.createElement("h2");
      title.textContent = "יום " + day.label + " " + date.getDate() + "." + two(date.getMonth() + 1);
      card.appendChild(title);

      var modes = document.createElement("div");
      modes.className = "avail__modes";
      [
        ["unset", "טרם הוגדר"],
        ["closed", "לא פנוי"],
        ["hours", "פנוי"]
      ].forEach(function (mode) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = mode[1];
        button.setAttribute("aria-pressed", week[day.id].status === mode[0] ? "true" : "false");
        button.addEventListener("click", function () {
          week[day.id].status = mode[0];
          render();
        });
        modes.appendChild(button);
      });
      card.appendChild(modes);

      var fields = document.createElement("div");
      fields.className = "avail__times";
      [["start", "שעת התחלה"], ["end", "שעת סיום"]].forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field[1];
        var input = document.createElement("input");
        input.type = "time";
        input.value = week[day.id][field[0]];
        input.disabled = week[day.id].status !== "hours";
        input.addEventListener("change", function () {
          week[day.id][field[0]] = input.value;
        });
        wrap.appendChild(input);
        fields.appendChild(wrap);
      });
      card.appendChild(fields);
      root.appendChild(card);
    });
  }

  document.getElementById("week-prev").addEventListener("click", function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    loadWeek();
    status.textContent = "";
    render();
  });
  document.getElementById("week-next").addEventListener("click", function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    loadWeek();
    status.textContent = "";
    render();
  });
  document.getElementById("week-save").addEventListener("click", function () {
    var invalid = false;
    schedule.weekdays.forEach(function (day) {
      var item = week[day.id];
      if (item.status === "hours" && (!item.start || !item.end || item.end <= item.start)) {
        invalid = true;
      }
    });
    if (invalid) {
      status.textContent = "ביום פנוי צריך שעת התחלה ושעת סיום מאוחרת ממנה.";
      return;
    }
    var store = readStore();
    store[iso(cursor)] = week;
    try {
      localStorage.setItem(schedule.storageKey, JSON.stringify({
        temporary: true,
        syncedWithBookings: false,
        weeks: store
      }));
    } catch (error) {
      status.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    status.textContent = "השבוע נשמר במכשיר זה בלבד. יומן ההזמנות של הלקוחות לא עודכן.";
  });

  loadWeek();
  render();
})();
