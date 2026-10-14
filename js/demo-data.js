/**
 * Demo catalog for the design stage.
 * These figures are not a payment and not a stored booking.
 * Replace this file later with Supabase or another backend.
 */
window.VIP_DEMO = {
  temporary: true,
  owner: {
    name: "זאבי הנאו",
    // Fixed admin account name for the future server login. Not a password.
    adminUsername: "zeevi",
    // WhatsApp number for wa.me: country code plus the mobile number, digits only.
    // No plus, spaces, or leading 0.
    whatsappPhone: "972512177021"
  },
  services: [
    {
      id: "mens-haircut",
      name: "תספורת גברים",
      summary: "תספורת בהתאמה אישית.",
      priceIls: 70,
      temporaryPrice: true
    },
    {
      id: "kids-haircut",
      name: "תספורת ילדים",
      summary: "תספורת לילדים באווירה נעימה, עם תוצאה מדויקת לכל גיל.",
      priceIls: 55,
      temporaryPrice: true
    },
    {
      id: "beard",
      name: "סידור זקן",
      summary: "תוספת לביקור, לא כרטיס שירות נפרד.",
      priceIls: 10,
      temporaryPrice: true,
      addon: true
    }
  ]
};

/**
 * Local availability for this device only.
 * syncedWithBookings stays false: nothing is shared between devices or a server.
 * The customer calendar on this same device does read standing hours, week overrides, and orders.
 * standing — the weekly template, reused every week.
 * weeks — one Sunday-keyed override. It does not change standing.
 * exceptions — an older date-level override. It wins for that date until the week is saved again.
 * Day status: unset, closed, or hours. Each haircut slot is 30 minutes.
 * Default template: Sunday–Thursday 17:00–21:00, Friday 09:00–12:00, Saturday closed.
 */
window.VIP_SCHEDULE = {
  temporary: true,
  syncedWithBookings: false,
  storageKey: "vip-week-availability",
  weekdays: [
    { id: "0", label: "ראשון" },
    { id: "1", label: "שני" },
    { id: "2", label: "שלישי" },
    { id: "3", label: "רביעי" },
    { id: "4", label: "חמישי" },
    { id: "5", label: "שישי" },
    { id: "6", label: "שבת" }
  ],
  standing: {
    "0": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "1": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "2": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "3": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "4": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "5": { status: "hours", start: "09:00", end: "12:00", slots: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"], temporary: true },
    "6": { status: "closed" }
  }
};

(function () {
  var schedule = window.VIP_SCHEDULE;

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

  function sundayOf(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  }

  function copyBreaks(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    return list.filter(function (item) {
      return item && typeof item.start === "string" && typeof item.end === "string";
    }).map(function (item) {
      return { start: item.start, end: item.end };
    });
  }

  function copyBlocked(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    return list.filter(function (item) {
      return typeof item === "string" && item;
    });
  }

  function normalizeDay(item) {
    var day = { status: "unset", start: "", end: "", blocked: [], breaks: [] };
    if (!item) {
      return day;
    }
    if (item.status === "closed" || item.status === "hours" || item.status === "unset") {
      day.status = item.status;
    }
    day.start = typeof item.start === "string" ? item.start : "";
    day.end = typeof item.end === "string" ? item.end : "";
    day.blocked = copyBlocked(item.blocked);
    day.breaks = copyBreaks(item.breaks);
    return day;
  }

  function readStore() {
    var empty = { standing: null, weeks: {}, exceptions: {} };
    try {
      var raw = localStorage.getItem(schedule.storageKey);
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object") {
        return empty;
      }
      return {
        standing: data.standing && typeof data.standing === "object" ? data.standing : null,
        weeks: data.weeks && typeof data.weeks === "object" ? data.weeks : {},
        exceptions: data.exceptions && typeof data.exceptions === "object" ? data.exceptions : {}
      };
    } catch (error) {
      return empty;
    }
  }

  function writeStore(next) {
    localStorage.setItem(schedule.storageKey, JSON.stringify({
      temporary: true,
      syncedWithBookings: false,
      standing: next && next.standing ? next.standing : null,
      weeks: next && next.weeks ? next.weeks : {},
      exceptions: next && next.exceptions ? next.exceptions : {}
    }));
  }

  function standingDay(dayId, store) {
    var source = store || readStore();
    var saved = source.standing && source.standing[String(dayId)];
    if (saved) {
      return normalizeDay(saved);
    }
    return normalizeDay(schedule.standing[String(dayId)]);
  }

  function dayFor(date) {
    var store = readStore();
    var key = iso(date);
    var dayId = String(date.getDay());
    if (store.exceptions[key]) {
      return normalizeDay(store.exceptions[key]);
    }
    var week = store.weeks[iso(sundayOf(date))];
    if (week && week[dayId]) {
      return normalizeDay(week[dayId]);
    }
    return standingDay(dayId, store);
  }

  function minutes(value) {
    var parts = String(value || "").split(":");
    if (parts.length < 2 || parts[0] === "") {
      return null;
    }
    var hour = Number(parts[0]);
    var minute = Number(parts[1]);
    if (isNaN(hour) || isNaN(minute)) {
      return null;
    }
    return hour * 60 + minute;
  }

  function slotsBetween(start, end) {
    var cursorMin = minutes(start);
    var endMin = minutes(end);
    var result = [];
    if (cursorMin === null || endMin === null || endMin <= cursorMin) {
      return [];
    }
    while (cursorMin + 30 <= endMin) {
      result.push(two(Math.floor(cursorMin / 60)) + ":" + two(cursorMin % 60));
      cursorMin += 30;
    }
    return result;
  }

  function overlapsBreak(slot, breaks) {
    var start = minutes(slot);
    if (start === null) {
      return true;
    }
    var end = start + 30;
    return breaks.some(function (item) {
      var from = minutes(item.start);
      var to = minutes(item.end);
      return from !== null && to !== null && start < to && end > from;
    });
  }

  function taken(dateValue) {
    var map = {};
    var orders = window.VIP_ORDERS && window.VIP_ORDERS.read ? window.VIP_ORDERS.read() : [];
    orders.forEach(function (order) {
      if (!order || (order.status !== "pending" && order.status !== "approved") || order.date !== dateValue || !order.time) {
        return;
      }
      map[order.time] = true;
    });
    return map;
  }

  function openSlots(date, options) {
    var opts = options || {};
    var day = opts.day || dayFor(date);
    var slots = [];
    if (!date || !day || day.status !== "hours") {
      return slots;
    }
    slots = slotsBetween(day.start, day.end).filter(function (slot) {
      return day.blocked.indexOf(slot) === -1 && !overlapsBreak(slot, day.breaks);
    });
    if (!opts.ignorePast) {
      var now = new Date();
      var todayKey = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      if (iso(date) === todayKey) {
        slots = slots.filter(function (slot) {
          var at = minutes(slot);
          var moment = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(at / 60), at % 60, 0, 0);
          return moment.getTime() > now.getTime();
        });
      }
    }
    if (!opts.ignoreTaken) {
      var busy = taken(iso(date));
      slots = slots.filter(function (slot) {
        return !busy[slot];
      });
    }
    return slots;
  }

  function slotOpen(dateValue, time) {
    var date = parse(dateValue);
    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!date || !time || date < start) {
      return false;
    }
    return openSlots(date).indexOf(time) !== -1;
  }

  schedule.normalizeDay = normalizeDay;
  schedule.readStore = readStore;
  schedule.writeStore = writeStore;
  schedule.standingDay = standingDay;
  schedule.dayFor = dayFor;
  schedule.slotsBetween = slotsBetween;
  schedule.openSlots = openSlots;
  schedule.slotOpen = slotOpen;
})();
