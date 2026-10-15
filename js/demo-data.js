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
      priceIls: 80,
      temporaryPrice: true
    },
    {
      id: "kids-haircut",
      name: "תספורת ילדים",
      summary: "תספורת לילדים באווירה נעימה, עם תוצאה מדויקת לכל גיל.",
      priceIls: 60,
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
  ],
  priceError: "",
  onUpdate: null,
  applyServer: function (rows) {
    var catalog = window.VIP_DEMO;
    (rows || []).forEach(function (row) {
      catalog.services.forEach(function (service) {
        if (service.id !== row.id || row.active === false) {
          return;
        }
        if (row.price_ils !== null && row.price_ils !== undefined && !isNaN(Number(row.price_ils))) {
          service.priceIls = Number(row.price_ils);
        }
        if (row.minutes !== null && row.minutes !== undefined && !isNaN(Number(row.minutes))) {
          service.minutes = Number(row.minutes);
        }
        if (row.name) {
          service.name = row.name;
        }
      });
    });
    catalog.priceError = "";
    if (catalog.onUpdate) {
      catalog.onUpdate();
    }
  }
};

/**
 * Hours and busy spans.
 * After a successful server load, remote replaces the device copy for the calendar.
 * The device copy stays in localStorage for the temporary development door.
 * standing — the weekly template, reused every week.
 * weeks — one Sunday-keyed override. It does not change standing.
 * exceptions — a date-level override. It wins for that date until the week is saved again.
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

  function activeStore() {
    if (schedule.remote) {
      return schedule.remote;
    }
    return readStore();
  }

  function standingDay(dayId, store) {
    var source = store || activeStore();
    var saved = source.standing && source.standing[String(dayId)];
    if (saved) {
      return normalizeDay(saved);
    }
    if (schedule.remote && source.standing === schedule.remote.standing) {
      return normalizeDay({ status: "closed" });
    }
    return normalizeDay(schedule.standing[String(dayId)]);
  }

  function dayFor(date) {
    var store = activeStore();
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

  function slotsStepped(start, end, step) {
    var cursorMin = minutes(start);
    var endMin = minutes(end);
    var result = [];
    if (cursorMin === null || endMin === null || !step || step < 1) {
      return [];
    }
    while (cursorMin < endMin) {
      result.push(two(Math.floor(cursorMin / 60)) + ":" + two(cursorMin % 60));
      cursorMin += step;
    }
    return result;
  }

  function visitMinutes() {
    var booking = window.VIP_BOOKING && window.VIP_BOOKING.read ? window.VIP_BOOKING.read() : null;
    var adults = booking ? Number(booking.adults) || 0 : 0;
    var children = booking ? Number(booking.children) || 0 : 0;
    var beards = booking ? Number(booking.beards) || 0 : 0;
    var service = schedule.serviceMinutes;
    var travel = schedule.travelMinutes;
    if (!booking || adults < 0 || children < 0 || beards < 0 || adults + children < 2 || adults > 20 || children > 20 || beards > adults) {
      return null;
    }
    if (typeof service !== "number" || typeof travel !== "number") {
      return null;
    }
    if (service < 10 || service > 180 || travel < 0 || travel > 180) {
      return null;
    }
    return { service: service, travel: travel };
  }

  function overlapsSpan(start, duration, from, to) {
    return start !== null && from !== null && to !== null && start < to && from < start + duration;
  }

  function overlapsBreak(slot, breaks, duration) {
    var start = minutes(slot);
    var span = duration || 30;
    if (start === null) {
      return true;
    }
    return breaks.some(function (item) {
      return overlapsSpan(start, span, minutes(item.start), minutes(item.end));
    });
  }

  function overlapsBlocked(slot, blocked, duration) {
    var start = minutes(slot);
    if (start === null) {
      return true;
    }
    return blocked.some(function (item) {
      var from = minutes(item);
      return overlapsSpan(start, duration, from, from === null ? null : from + 30);
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

  function jerusalemOffset(utcMs) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(utcMs));
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    var asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour) % 24, Number(map.minute), Number(map.second));
    return asUtc - utcMs;
  }

  function slotMoment(date, slot) {
    var at = minutes(slot);
    if (!date || at === null) {
      return null;
    }
    var utcGuess = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(at / 60), at % 60, 0, 0);
    return new Date(utcGuess - jerusalemOffset(utcGuess));
  }

  function serverTaken(date, slot, visit) {
    var ranges = schedule.busyRanges && schedule.busyRanges[iso(date)];
    var start = slotMoment(date, slot);
    var reserved = visit ? (visit.service + visit.travel) * 60 * 1000 : 30 * 60 * 1000;
    if (!ranges || !start) {
      return false;
    }
    return ranges.some(function (range) {
      return start.getTime() < range.end && range.start < start.getTime() + reserved;
    });
  }

  function openSlots(date, options) {
    var opts = options || {};
    var day = opts.day || dayFor(date);
    var slots = [];
    var visit = null;
    var closeAt = null;
    if (schedule.unavailable || !date || !day || day.status !== "hours") {
      return slots;
    }
    closeAt = minutes(day.end);
    if (schedule.fitVisit) {
      visit = visitMinutes();
      if (!visit || closeAt === null) {
        return [];
      }
      // Offered starts are 70 minutes apart. A visit still blocks only its service length plus travel.
      slots = slotsStepped(day.start, day.end, 70);
      slots = slots.filter(function (slot) {
        var start = minutes(slot);
        return start !== null && start < closeAt && !overlapsBreak(slot, day.breaks, visit.service) && !overlapsBlocked(slot, day.blocked, visit.service);
      });
    } else {
      slots = slotsBetween(day.start, day.end);
      slots = slots.filter(function (slot) {
        return day.blocked.indexOf(slot) === -1 && !overlapsBreak(slot, day.breaks, 30);
      });
    }
    if (!opts.ignorePast) {
      if (schedule.fitVisit) {
        var nowMs = Date.now();
        slots = slots.filter(function (slot) {
          var moment = slotMoment(date, slot);
          return moment && moment.getTime() > nowMs;
        });
      } else {
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
    }
    if (!opts.ignoreTaken) {
      if (schedule.remote) {
        slots = slots.filter(function (slot) {
          return !serverTaken(date, slot, visit);
        });
      } else {
        var busy = taken(iso(date));
        slots = slots.filter(function (slot) {
          return !busy[slot];
        });
      }
    }
    return slots;
  }

  function bookingUntil(from) {
    var start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var extra = (6 - start.getDay()) + 7;
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + extra);
  }

  function slotOpen(dateValue, time) {
    var date = parse(dateValue);
    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!date || !time || date < start || date > bookingUntil(start)) {
      return false;
    }
    return openSlots(date).indexOf(time) !== -1;
  }

  function clockText(value) {
    var text = String(value || "");
    return text.length >= 5 ? text.slice(0, 5) : text;
  }

  function dayFromRow(row) {
    return normalizeDay({
      status: row.status,
      start: clockText(row.start_time),
      end: clockText(row.end_time),
      breaks: (row.breaks || []).map(function (item) {
        return { start: clockText(item && item.start), end: clockText(item && item.end) };
      }),
      blocked: (row.blocked || []).map(clockText)
    });
  }

  schedule.remote = null;
  schedule.busyRanges = {};
  schedule.unavailable = false;
  schedule.loadError = "";
  schedule.fitVisit = false;
  schedule.serviceMinutes = null;
  schedule.travelMinutes = null;
  schedule.applyRemote = function (payload, busyRows) {
    var standing = {};
    var weeks = {};
    var exceptions = {};
    var ranges = {};
    (payload.weekly || []).forEach(function (row) {
      standing[String(row.weekday)] = dayFromRow(row);
    });
    (payload.weeks || []).forEach(function (row) {
      var key = String(row.week_start).slice(0, 10);
      if (!weeks[key]) {
        weeks[key] = {};
      }
      weeks[key][String(row.weekday)] = dayFromRow(row);
    });
    (payload.exceptions || []).forEach(function (row) {
      exceptions[String(row.service_date).slice(0, 10)] = dayFromRow(row);
    });
    (busyRows || []).forEach(function (row) {
      var key = String(row.appointment_date).slice(0, 10);
      var start = Date.parse(row.starts_at);
      var end = Date.parse(row.blocked_until);
      if (!ranges[key]) {
        ranges[key] = [];
      }
      if (!isNaN(start) && !isNaN(end)) {
        ranges[key].push({ start: start, end: end });
      }
    });
    schedule.remote = { standing: standing, weeks: weeks, exceptions: exceptions };
    schedule.busyRanges = ranges;
    schedule.serviceMinutes = typeof payload.serviceMinutes === "number" ? payload.serviceMinutes : null;
    schedule.travelMinutes = typeof payload.travelMinutes === "number" ? payload.travelMinutes : null;
    schedule.unavailable = false;
    schedule.loadError = "";
    if (schedule.onChange) {
      schedule.onChange();
    }
  };
  schedule.normalizeDay = normalizeDay;
  schedule.readStore = readStore;
  schedule.writeStore = writeStore;
  schedule.standingDay = standingDay;
  schedule.dayFor = dayFor;
  schedule.slotsBetween = slotsBetween;
  schedule.openSlots = openSlots;
  schedule.slotOpen = slotOpen;
  schedule.bookingUntil = bookingUntil;
})();
