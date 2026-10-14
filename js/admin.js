(function () {
  "use strict";

  if (!document.body.classList.contains("admin")) {
    return;
  }

  var root = document.getElementById("week-days");
  var schedule = window.VIP_SCHEDULE;
  var ordersApi = window.VIP_ORDERS;
  if (!root || !schedule || !ordersApi) {
    return;
  }

  var settingsKey = "vip-business-settings";
  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var paymentNames = { paybox: "PayBox", cash: "מזומן", transfer: "העברה בנקאית" };
  var statusNames = { pending: "ממתין", approved: "מאושר", rejected: "נדחה", cancelled: "בוטל" };
  var today = new Date();
  var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
  var week = {};
  var exceptions = {};
  var openExtras = {};
  var requestFilter = "all";
  var cancelId = "";
  var exceptionDraft = blankDay();
  exceptionDraft.status = "closed";

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  function two(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function iso(date) {
    return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate());
  }

  function paragraph(parent, text, className) {
    var node = document.createElement("p");
    node.textContent = text;
    if (className) {
      node.className = className;
    }
    parent.appendChild(node);
    return node;
  }

  function dateLabel(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 3) {
      return "לא נבחר תאריך";
    }
    return Number(parts[2]) + " ב" + (months[Number(parts[1]) - 1] || "") + " " + parts[0];
  }

  function readAvailability() {
    try {
      var raw = localStorage.getItem(schedule.storageKey);
      var data = raw ? JSON.parse(raw) : {};
      return {
        weeks: data && data.weeks ? data.weeks : {},
        exceptions: data && data.exceptions ? data.exceptions : {}
      };
    } catch (error) {
      return { weeks: {}, exceptions: {} };
    }
  }

  function writeAvailability(weeks) {
    localStorage.setItem(schedule.storageKey, JSON.stringify({
      temporary: true,
      syncedWithBookings: false,
      weeks: weeks,
      exceptions: exceptions
    }));
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

  function blankDay() {
    return { status: "unset", start: "", end: "", blocked: [], breaks: [] };
  }

  function normalizeDay(item) {
    var day = blankDay();
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

  function blankWeek() {
    var days = {};
    schedule.weekdays.forEach(function (day) {
      days[day.id] = blankDay();
    });
    return days;
  }

  function loadWeek() {
    var stored = readAvailability();
    exceptions = stored.exceptions;
    week = blankWeek();
    var saved = stored.weeks[iso(cursor)] || null;
    if (!saved) {
      return;
    }
    schedule.weekdays.forEach(function (day) {
      week[day.id] = normalizeDay(saved[day.id]);
    });
  }

  function slotsBetween(start, end) {
    if (!start || !end || end <= start) {
      return [];
    }
    var startParts = start.split(":");
    var endParts = end.split(":");
    var cursorMin = Number(startParts[0]) * 60 + Number(startParts[1]);
    var endMin = Number(endParts[0]) * 60 + Number(endParts[1]);
    var result = [];
    if (isNaN(cursorMin) || isNaN(endMin)) {
      return [];
    }
    while (cursorMin + 30 <= endMin) {
      result.push(two(Math.floor(cursorMin / 60)) + ":" + two(cursorMin % 60));
      cursorMin += 30;
    }
    return result;
  }

  function dayHoursValid(item) {
    if (item.status !== "hours") {
      return true;
    }
    if (!item.start || !item.end || item.end <= item.start) {
      return false;
    }
    return !item.breaks.some(function (br) {
      return !br.start || !br.end || br.end <= br.start || br.start < item.start || br.end > item.end;
    });
  }

  function markDirty() {
    var statusNode = document.getElementById("week-status");
    if (statusNode) {
      statusNode.textContent = "יש שינויים בשבוע הזה שעדיין לא נשמרו.";
    }
  }

  function serviceText(order) {
    var services = window.VIP_DEMO && window.VIP_DEMO.services ? window.VIP_DEMO.services : [];
    function price(id) {
      var found = null;
      services.forEach(function (service) {
        if (service.id === id) {
          found = service;
        }
      });
      if (!found || found.priceOnRequest || found.priceIls === null || found.priceIls === undefined) {
        return null;
      }
      return found.priceIls;
    }
    var parts = [];
    var total = 0;
    var adultPrice = price("mens-haircut");
    var childPrice = price("kids-haircut");
    var beardPrice = price("beard");
    if (order.adults) {
      parts.push(order.adults + " תספורת גברים" + (adultPrice === null ? "" : " (" + (order.adults * adultPrice) + " ₪)"));
      if (adultPrice !== null) {
        total += order.adults * adultPrice;
      }
    }
    if (order.children) {
      parts.push(order.children + " תספורת ילדים" + (childPrice === null ? "" : " (" + (order.children * childPrice) + " ₪)"));
      if (childPrice !== null) {
        total += order.children * childPrice;
      }
    }
    if (order.beards) {
      parts.push(order.beards + " סידור זקן" + (beardPrice === null ? "" : " (" + (order.beards * beardPrice) + " ₪)"));
      if (beardPrice !== null) {
        total += order.beards * beardPrice;
      }
    }
    if (order.vip) {
      parts.push(order.vip + " חבילת VIP, מחיר בתיאום");
    }
    if (!parts.length) {
      return "לא צוינו שירותים";
    }
    if (total > 0) {
      parts.push("סה״כ לפי קטלוג הלקוח: " + total + " ₪");
    }
    return parts.join(" · ");
  }

  function addressOf(customer) {
    var street = customer.street || "";
    if (customer.houseNumber) {
      street = street ? street + " " + customer.houseNumber : customer.houseNumber;
    }
    if (customer.city) {
      return street ? street + ", " + customer.city : customer.city;
    }
    return street;
  }

  function whenText(order) {
    return dateLabel(order.date) + (order.time ? ", בשעה " + order.time : "");
  }

  function ordersOn(dateValue) {
    return ordersApi.read().filter(function (order) {
      return order.date === dateValue && order.status !== "rejected" && order.status !== "cancelled";
    });
  }

  function conflictText(order, source) {
    if (!source || source.status === "unset") {
      return "";
    }
    if (source.status === "closed") {
      return "התור יושב על יום שמסומן סגור בניהול.";
    }
    if (order.time && source.start && source.end && (order.time < source.start || order.time >= source.end)) {
      return "השעה מחוץ לטווח המוגדר כאן.";
    }
    if (order.time && source.blocked.indexOf(order.time) !== -1) {
      return "השעה מסומנת כחסומה ועדיין יש תור.";
    }
    var inBreak = source.breaks.some(function (item) {
      return order.time && order.time >= item.start && order.time < item.end;
    });
    return inBreak ? "השעה נופלת בתוך הפסקה." : "";
  }

  function fillExtras(extras, day) {
    var item = week[day.id];
    extras.textContent = "";
    paragraph(extras, "הפסקות", "admin-kicker");
    item.breaks.forEach(function (br, index) {
      var row = document.createElement("div");
      row.className = "admin-break";
      [["start", "התחלה"], ["end", "סיום"]].forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field[1];
        var input = document.createElement("input");
        input.type = "time";
        input.value = br[field[0]];
        input.addEventListener("change", function () {
          item.breaks[index][field[0]] = input.value;
          markDirty();
        });
        wrap.appendChild(input);
        row.appendChild(wrap);
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost";
      remove.textContent = "הסרת הפסקה";
      remove.addEventListener("click", function () {
        item.breaks.splice(index, 1);
        markDirty();
        fillExtras(extras, day);
      });
      row.appendChild(remove);
      extras.appendChild(row);
    });
    var addBreak = document.createElement("button");
    addBreak.type = "button";
    addBreak.className = "btn btn--ghost";
    addBreak.textContent = "הוספת הפסקה";
    addBreak.addEventListener("click", function () {
      item.breaks.push({ start: item.start || "", end: "" });
      markDirty();
      fillExtras(extras, day);
    });
    extras.appendChild(addBreak);
    paragraph(extras, "שעות חסומות", "admin-kicker");
    var slots = item.status === "hours" ? slotsBetween(item.start, item.end) : [];
    if (!slots.length) {
      paragraph(extras, "אחרי שמגדירים שעת התחלה וסיום אפשר לחסום שעות של חצי שעה.");
      return;
    }
    var grid = document.createElement("div");
    grid.className = "admin-slots";
    slots.forEach(function (slot) {
      var button = document.createElement("button");
      var blocked = item.blocked.indexOf(slot) !== -1;
      button.type = "button";
      button.className = "admin-slot";
      button.textContent = slot;
      button.setAttribute("aria-pressed", blocked ? "true" : "false");
      button.setAttribute("aria-label", (blocked ? "שעה חסומה " : "חסימת השעה ") + slot);
      button.addEventListener("click", function () {
        var place = item.blocked.indexOf(slot);
        if (place === -1) {
          item.blocked.push(slot);
        } else {
          item.blocked.splice(place, 1);
        }
        markDirty();
        fillExtras(extras, day);
      });
      grid.appendChild(button);
    });
    extras.appendChild(grid);
  }

  function renderWeek() {
    var label = document.getElementById("week-label");
    var end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 5);
    if (!label) {
      return;
    }
    label.textContent = cursor.getDate() + " ב" + months[cursor.getMonth()] + " – " + end.getDate() + " ב" + months[end.getMonth()] + " " + end.getFullYear();
    root.textContent = "";
    schedule.weekdays.forEach(function (day) {
      if (day.id === "6") {
        return;
      }
      var date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + Number(day.id));
      var dateValue = iso(date);
      var item = week[day.id];
      var card = document.createElement("article");
      var savedException = exceptions[dateValue] ? normalizeDay(exceptions[dateValue]) : null;
      card.className = "avail__day" + (dateValue === iso(today) ? " is-today" : "");

      var title = document.createElement("h2");
      title.textContent = "יום " + day.label + ", " + date.getDate() + " ב" + months[date.getMonth()];
      card.appendChild(title);
      if (savedException) {
        var exceptionLabel = savedException.status === "closed" ? "סגור" : ((savedException.start && savedException.end) ? savedException.start + "–" + savedException.end : "שעות חריגות");
        paragraph(card, "לתאריך זה שמורות שעות חריגות: " + exceptionLabel, "admin-flag");
      }

      var modes = document.createElement("div");
      modes.className = "avail__modes";
      [["unset", "טרם הוגדר"], ["closed", "סגור"], ["hours", "פתוח"]].forEach(function (mode) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = mode[1];
        button.setAttribute("aria-pressed", item.status === mode[0] ? "true" : "false");
        button.addEventListener("click", function () {
          item.status = mode[0];
          markDirty();
          renderWeek();
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
        input.value = item[field[0]];
        input.disabled = item.status !== "hours";
        input.addEventListener("change", function () {
          item[field[0]] = input.value;
          markDirty();
          var extras = card.querySelector(".admin-extras");
          if (extras) {
            fillExtras(extras, day);
          }
        });
        wrap.appendChild(input);
        fields.appendChild(wrap);
      });
      card.appendChild(fields);

      var details = document.createElement("details");
      details.className = "admin-details";
      if (openExtras[day.id]) {
        details.open = true;
      }
      details.addEventListener("toggle", function () {
        openExtras[day.id] = details.open;
      });
      var summary = document.createElement("summary");
      summary.textContent = "הפסקות ושעות חסומות";
      var extras = document.createElement("div");
      extras.className = "admin-extras";
      details.appendChild(summary);
      details.appendChild(extras);
      fillExtras(extras, day);
      card.appendChild(details);

      var visits = ordersOn(dateValue);
      var source = savedException || item;
      paragraph(card, "תורים במכשיר זה", "admin-kicker");
      if (!visits.length) {
        paragraph(card, "אין תור שמור ליום הזה.");
      } else {
        visits.forEach(function (order) {
          var customer = order.customer || {};
          var warning = conflictText(order, source);
          paragraph(card, (customer.fullName || "ללא שם") + (order.time ? " · " + order.time : "") + " · " + (statusNames[order.status] || "ממתין"));
          if (warning) {
            paragraph(card, warning, "admin-warn");
          }
        });
      }
      root.appendChild(card);
    });
  }

  function cleanWeek() {
    var days = {};
    schedule.weekdays.forEach(function (day) {
      var item = week[day.id];
      days[day.id] = {
        status: item.status,
        start: item.start,
        end: item.end,
        blocked: item.status === "hours" ? item.blocked.filter(function (slot) {
          return slotsBetween(item.start, item.end).indexOf(slot) !== -1;
        }) : [],
        breaks: item.breaks.map(function (br) {
          return { start: br.start, end: br.end };
        })
      };
    });
    return days;
  }

  function saveWeek() {
    var statusNode = document.getElementById("week-status");
    var invalid = false;
    schedule.weekdays.forEach(function (day) {
      if (!dayHoursValid(week[day.id])) {
        invalid = true;
      }
    });
    if (invalid) {
      statusNode.textContent = "ביום פתוח צריך שעת התחלה, שעת סיום מאוחרת ממנה, והפסקות בתוך הטווח.";
      return;
    }
    var stored = readAvailability();
    stored.weeks[iso(cursor)] = cleanWeek();
    exceptions = stored.exceptions;
    try {
      writeAvailability(stored.weeks);
    } catch (error) {
      statusNode.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    statusNode.textContent = "השבוע נשמר במכשיר זה בלבד. יומן הלקוחות לא עודכן.";
    renderWeek();
  }

  function paintException() {
    var closed = document.querySelector("[data-exception-status='closed']");
    var hours = document.querySelector("[data-exception-status='hours']");
    var start = document.getElementById("exception-start");
    var end = document.getElementById("exception-end");
    var breaks = document.getElementById("exception-breaks");
    var blocks = document.getElementById("exception-blocks");
    if (closed) {
      closed.setAttribute("aria-pressed", exceptionDraft.status === "closed" ? "true" : "false");
    }
    if (hours) {
      hours.setAttribute("aria-pressed", exceptionDraft.status === "hours" ? "true" : "false");
    }
    if (start) {
      start.value = exceptionDraft.start;
      start.disabled = exceptionDraft.status !== "hours";
    }
    if (end) {
      end.value = exceptionDraft.end;
      end.disabled = exceptionDraft.status !== "hours";
    }
    if (!breaks || !blocks) {
      return;
    }
    breaks.textContent = "";
    exceptionDraft.breaks.forEach(function (br, index) {
      var row = document.createElement("div");
      row.className = "admin-break";
      [["start", "התחלה"], ["end", "סיום"]].forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field[1];
        var input = document.createElement("input");
        input.type = "time";
        input.value = br[field[0]];
        input.disabled = exceptionDraft.status !== "hours";
        input.addEventListener("change", function () {
          exceptionDraft.breaks[index][field[0]] = input.value;
        });
        wrap.appendChild(input);
        row.appendChild(wrap);
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost";
      remove.textContent = "הסרת הפסקה";
      remove.addEventListener("click", function () {
        exceptionDraft.breaks.splice(index, 1);
        paintException();
      });
      row.appendChild(remove);
      breaks.appendChild(row);
    });
    blocks.textContent = "";
    var slots = exceptionDraft.status === "hours" ? slotsBetween(exceptionDraft.start, exceptionDraft.end) : [];
    if (!slots.length) {
      paragraph(blocks, "בחרו שעות חריגות כדי לחסום שעות בתאריך הזה.");
      return;
    }
    var grid = document.createElement("div");
    grid.className = "admin-slots";
    slots.forEach(function (slot) {
      var button = document.createElement("button");
      var blocked = exceptionDraft.blocked.indexOf(slot) !== -1;
      button.type = "button";
      button.className = "admin-slot";
      button.textContent = slot;
      button.setAttribute("aria-pressed", blocked ? "true" : "false");
      button.addEventListener("click", function () {
        var place = exceptionDraft.blocked.indexOf(slot);
        if (place === -1) {
          exceptionDraft.blocked.push(slot);
        } else {
          exceptionDraft.blocked.splice(place, 1);
        }
        paintException();
      });
      grid.appendChild(button);
    });
    blocks.appendChild(grid);
  }

  function loadException(dateValue) {
    exceptionDraft = normalizeDay(exceptions[dateValue]);
    if (!exceptions[dateValue]) {
      exceptionDraft.status = "closed";
      exceptionDraft.start = "";
      exceptionDraft.end = "";
    }
    paintException();
  }

  function stamp(order) {
    if (!order.date) {
      return null;
    }
    var dateParts = String(order.date).split("-");
    var timeParts = String(order.time || "00:00").split(":");
    if (dateParts.length !== 3) {
      return null;
    }
    var point = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]), Number(timeParts[0]) || 0, Number(timeParts[1]) || 0);
    return isNaN(point.getTime()) ? null : point;
  }

  function paintDashboard() {
    var list = ordersApi.read();
    var now = new Date();
    var todayValue = iso(now);
    var pending = list.filter(function (order) {
      return order.status === "pending";
    });
    var fresh = pending.filter(function (order) {
      if (!order.createdAt) {
        return false;
      }
      var createdDate = new Date(order.createdAt);
      return !isNaN(createdDate.getTime()) && iso(createdDate) === todayValue;
    });
    var todayApproved = list.filter(function (order) {
      return order.status === "approved" && order.date === todayValue;
    });
    var upcoming = list.filter(function (order) {
      var point = stamp(order);
      return order.status === "approved" && point && point.getTime() >= now.getTime();
    }).sort(function (a, b) {
      return stamp(a).getTime() - stamp(b).getTime();
    });
    document.getElementById("stat-new").textContent = String(fresh.length);
    document.getElementById("stat-pending").textContent = String(pending.length);
    document.getElementById("stat-today").textContent = String(todayApproved.length);
    var nextNode = document.getElementById("next-slot");
    if (nextNode) {
      nextNode.textContent = "";
      if (!upcoming.length) {
        paragraph(nextNode, "אין תור מאושר קרוב במכשיר זה.");
      } else {
        var next = upcoming[0];
        var customer = next.customer || {};
        paragraph(nextNode, whenText(next));
        paragraph(nextNode, (customer.fullName || "ללא שם") + (customer.phone ? " · " + customer.phone : ""));
        paragraph(nextNode, serviceText(next));
      }
    }
    paintNotices();
  }

  function paintNotices() {
    var target = document.getElementById("admin-notice-list");
    if (!target || !window.VIP_NOTICES) {
      return;
    }
    var items = window.VIP_NOTICES.read().filter(function (item) {
      return item.type === "customer-cancel" && !item.seen;
    });
    target.textContent = "";
    if (!items.length) {
      paragraph(target, "אין התראות ביטול חדשות. שליחה אמיתית לזאבי תחובר אחר כך.");
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("article");
      var button = document.createElement("button");
      card.className = "admin-request is-cancelled";
      paragraph(card, item.text);
      paragraph(card, "ההתראה שמורה במכשיר זה. היא עדיין לא נשלחת לזאבי.");
      button.type = "button";
      button.className = "btn btn--ghost";
      button.textContent = "הבנתי";
      button.addEventListener("click", function () {
        window.VIP_NOTICES.markSeen(item.id);
        paintNotices();
      });
      card.appendChild(button);
      target.appendChild(card);
    });
  }

  function arrivalLines(customer) {
    var lines = [];
    var address = addressOf(customer);
    if (address) {
      lines.push("כתובת: " + address);
    }
    if (customer.entrance) {
      lines.push("כניסה: " + customer.entrance);
    }
    if (customer.floor) {
      lines.push("קומה: " + customer.floor);
    }
    if (customer.apartment) {
      lines.push("דירה: " + customer.apartment);
    }
    if (customer.entryCode) {
      lines.push("קוד כניסה: " + customer.entryCode);
    }
    if (customer.notes) {
      lines.push("הערות: " + customer.notes);
    }
    if (customer.payment && paymentNames[customer.payment]) {
      lines.push("תשלום אחרי התספורת: " + paymentNames[customer.payment]);
    }
    return lines;
  }

  function feedback(text) {
    var requestNode = document.getElementById("request-feedback");
    var approvedNode = document.getElementById("approved-feedback");
    if (requestNode) {
      requestNode.textContent = text;
    }
    if (approvedNode) {
      approvedNode.textContent = text;
    }
  }

  function renderRequestCard(order) {
    var customer = order.customer || {};
    var lines = arrivalLines(customer);
    var card = document.createElement("article");
    var badge = document.createElement("p");
    var who = document.createElement("p");
    card.className = "order-card admin-request is-" + (statusNames[order.status] ? order.status : "pending");
    badge.className = "order-card__status is-" + (statusNames[order.status] ? order.status : "pending");
    badge.textContent = statusNames[order.status] || "ממתין";
    card.appendChild(badge);
    if (order.cancelledBy === "customer") {
      paragraph(card, "בוטל על ידי הלקוח. ההתראה שמורה במכשיר זה ועדיין לא נשלחת.");
    }
    paragraph(card, whenText(order), "admin-when");
    paragraph(card, serviceText(order));
    who.appendChild(document.createTextNode((customer.fullName || "ללא שם") + " · "));
    if (customer.phone) {
      var link = document.createElement("a");
      link.href = "tel:" + String(customer.phone).replace(/[^\d+]/g, "");
      link.textContent = customer.phone;
      who.appendChild(link);
    } else {
      who.appendChild(document.createTextNode("אין טלפון"));
    }
    card.appendChild(who);
    if (lines.length) {
      lines.forEach(function (line) {
        paragraph(card, line);
      });
    } else {
      paragraph(card, "אין הערות או פרטי הגעה.");
    }
    if (order.photo) {
      var image = document.createElement("img");
      image.src = order.photo;
      image.alt = "תמונת הכניסה לבניין";
      card.appendChild(image);
    }
    var actions = document.createElement("div");
    actions.className = "admin-actions";
    if (order.status === "pending") {
      var approve = document.createElement("button");
      var reject = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--gold";
      approve.textContent = "אישור התור";
      approve.addEventListener("click", function () {
        ordersApi.approve(order.id);
        feedback("התור סומן כמאושר במכשיר זה בלבד. לא נשלחה התראה.");
        refreshLists();
      });
      reject.type = "button";
      reject.className = "btn btn--ghost";
      reject.textContent = "דחיית הבקשה";
      reject.addEventListener("click", function () {
        ordersApi.reject(order.id);
        feedback("הבקשה סומנה כנדחתה במכשיר זה בלבד. לא נשלחה התראה.");
        refreshLists();
      });
      actions.appendChild(approve);
      actions.appendChild(reject);
      card.appendChild(actions);
    } else if (order.status === "approved") {
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn--ghost";
      cancel.textContent = "ביטול התור";
      cancel.addEventListener("click", function () {
        askCancel(order);
      });
      actions.appendChild(cancel);
      card.appendChild(actions);
    }
    return card;
  }

  function paintRequests() {
    var target = document.getElementById("admin-request-list");
    var items = ordersApi.read().filter(function (order) {
      return requestFilter === "all" || order.status === requestFilter;
    }).sort(function (a, b) {
      var rank = { pending: 0, approved: 1, rejected: 2, cancelled: 3 };
      return (rank[a.status] || 9) - (rank[b.status] || 9);
    });
    target.textContent = "";
    if (!items.length) {
      paragraph(target, "אין בקשות במכשיר זה לסינון שנבחר. בקשה מופיעה כאן רק אחרי שליחה מאותו מכשיר.", "orders-empty");
      return;
    }
    items.forEach(function (order) {
      target.appendChild(renderRequestCard(order));
    });
  }

  function paintApproved() {
    var target = document.getElementById("admin-approved-list");
    var items = ordersApi.read().filter(function (order) {
      return order.status === "approved";
    }).sort(function (a, b) {
      var aTime = stamp(a) ? stamp(a).getTime() : 0;
      var bTime = stamp(b) ? stamp(b).getTime() : 0;
      return aTime - bTime;
    });
    target.textContent = "";
    if (!items.length) {
      paragraph(target, "אין תורים מאושרים במכשיר זה.", "orders-empty");
      return;
    }
    items.forEach(function (order) {
      target.appendChild(renderRequestCard(order));
    });
  }

  function refreshLists() {
    paintDashboard();
    paintRequests();
    paintApproved();
    renderWeek();
  }

  function askCancel(order) {
    var dialog = document.getElementById("admin-confirm");
    var text = document.getElementById("admin-confirm-text");
    var customer = order.customer || {};
    cancelId = order.id;
    text.textContent = "לבטל את התור של " + (customer.fullName || "הלקוח") + " ב" + whenText(order) + "? הביטול נשמר במכשיר זה בלבד, והלקוח לא מקבל התראה.";
    if (dialog.showModal) {
      dialog.showModal();
    }
  }

  function showPanel(name) {
    each(document.querySelectorAll("[data-admin-section]"), function (panel) {
      panel.hidden = panel.getAttribute("data-admin-section") !== name;
    });
    each(document.querySelectorAll(".admin-nav [data-admin-panel]"), function (button) {
      if (button.getAttribute("data-admin-panel") === name) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    if (name === "dashboard" || name === "requests" || name === "approved" || name === "calendar") {
      refreshLists();
    }
    try {
      history.replaceState(null, "", "#" + name);
    } catch (error) {
      window.location.hash = name;
    }
  }

  function readSettings() {
    var demo = window.VIP_DEMO && window.VIP_DEMO.services ? window.VIP_DEMO.services : [];
    var base = {
      name: window.VIP_DEMO && window.VIP_DEMO.owner ? window.VIP_DEMO.owner.name : "זאבי הנאו",
      slotMinutes: 30,
      services: {}
    };
    demo.forEach(function (service) {
      base.services[service.id] = {
        priceIls: service.priceOnRequest ? null : service.priceIls,
        minutes: 30
      };
    });
    try {
      var raw = localStorage.getItem(settingsKey);
      var saved = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== "object") {
        return base;
      }
      if (typeof saved.name === "string" && saved.name.trim()) {
        base.name = saved.name.trim();
      }
      if (saved.slotMinutes >= 15 && saved.slotMinutes <= 180) {
        base.slotMinutes = Number(saved.slotMinutes);
      }
      Object.keys(base.services).forEach(function (id) {
        var item = saved.services && saved.services[id];
        if (!item) {
          return;
        }
        if (base.services[id].priceIls !== null && item.priceIls !== null && item.priceIls !== "" && !isNaN(Number(item.priceIls))) {
          base.services[id].priceIls = Number(item.priceIls);
        }
        if (item.minutes >= 15 && item.minutes <= 180) {
          base.services[id].minutes = Number(item.minutes);
        }
      });
    } catch (error) {
      return base;
    }
    return base;
  }

  function fillSettings() {
    var form = document.getElementById("business-form");
    var data = readSettings();
    if (!form) {
      return;
    }
    document.getElementById("biz-name").value = data.name;
    document.getElementById("biz-slot").value = String(data.slotMinutes);
    each(form.querySelectorAll("[data-service]"), function (input) {
      var service = data.services[input.getAttribute("data-service")];
      if (!service) {
        return;
      }
      if (input.getAttribute("data-field") === "price") {
        input.value = service.priceIls === null || service.priceIls === undefined ? "" : String(service.priceIls);
      }
      if (input.getAttribute("data-field") === "minutes") {
        input.value = String(service.minutes);
      }
    });
  }

  document.getElementById("week-prev").addEventListener("click", function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
    loadWeek();
    document.getElementById("week-status").textContent = "";
    renderWeek();
  });
  document.getElementById("week-next").addEventListener("click", function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    loadWeek();
    document.getElementById("week-status").textContent = "";
    renderWeek();
  });
  document.getElementById("week-save").addEventListener("click", saveWeek);

  document.getElementById("exception-date").addEventListener("change", function (event) {
    var message = document.getElementById("exception-status");
    loadException(event.target.value);
    message.textContent = event.target.value && exceptions[event.target.value] ? "נמצאו שעות חריגות שמורות לתאריך הזה." : "אין עדיין שעות חריגות לתאריך הזה.";
  });
  each(document.querySelectorAll("[data-exception-status]"), function (button) {
    button.addEventListener("click", function () {
      exceptionDraft.status = button.getAttribute("data-exception-status");
      paintException();
    });
  });
  document.getElementById("exception-start").addEventListener("change", function (event) {
    exceptionDraft.start = event.target.value;
    paintException();
  });
  document.getElementById("exception-end").addEventListener("change", function (event) {
    exceptionDraft.end = event.target.value;
    paintException();
  });
  document.getElementById("exception-add-break").addEventListener("click", function () {
    exceptionDraft.breaks.push({ start: exceptionDraft.start || "", end: "" });
    paintException();
  });
  document.getElementById("exception-save").addEventListener("click", function () {
    var message = document.getElementById("exception-status");
    var dateValue = document.getElementById("exception-date").value;
    var stored;
    if (!dateValue) {
      message.textContent = "בחרו תאריך לפני השמירה.";
      return;
    }
    if (!dayHoursValid(exceptionDraft)) {
      message.textContent = "בשעות חריגות צריך התחלה, סיום מאוחר ממנה, והפסקות בתוך הטווח.";
      return;
    }
    stored = readAvailability();
    exceptions = stored.exceptions;
    exceptions[dateValue] = {
      status: exceptionDraft.status,
      start: exceptionDraft.start,
      end: exceptionDraft.end,
      blocked: exceptionDraft.status === "hours" ? exceptionDraft.blocked.filter(function (slot) {
        return slotsBetween(exceptionDraft.start, exceptionDraft.end).indexOf(slot) !== -1;
      }) : [],
      breaks: exceptionDraft.breaks.map(function (br) {
        return { start: br.start, end: br.end };
      })
    };
    try {
      writeAvailability(stored.weeks);
    } catch (error) {
      message.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    message.textContent = "השעות החריגות נשמרו במכשיר זה בלבד. יומן הלקוחות לא עודכן.";
    renderWeek();
  });
  document.getElementById("exception-clear").addEventListener("click", function () {
    var message = document.getElementById("exception-status");
    var dateValue = document.getElementById("exception-date").value;
    var stored;
    if (!dateValue || !exceptions[dateValue]) {
      message.textContent = "אין שעות חריגות למחוק בתאריך שנבחר.";
      return;
    }
    stored = readAvailability();
    exceptions = stored.exceptions;
    delete exceptions[dateValue];
    try {
      writeAvailability(stored.weeks);
    } catch (error) {
      message.textContent = "לא ניתן למחוק במכשיר זה.";
      return;
    }
    loadException(dateValue);
    message.textContent = "השעות החריגות נמחקו מהמכשיר הזה.";
    renderWeek();
  });

  document.getElementById("admin-confirm-yes").addEventListener("click", function () {
    var dialog = document.getElementById("admin-confirm");
    if (cancelId) {
      ordersApi.cancel(cancelId, { by: "admin" });
      cancelId = "";
      feedback("התור סומן כבוטל במכשיר זה בלבד. לא נשלחה התראה.");
      refreshLists();
    }
    dialog.close();
  });
  document.getElementById("admin-confirm-no").addEventListener("click", function () {
    cancelId = "";
    document.getElementById("admin-confirm").close();
  });

  document.getElementById("business-form").addEventListener("submit", function (event) {
    var message = document.getElementById("biz-status");
    var current = readSettings();
    var name = document.getElementById("biz-name").value.trim();
    var slotMinutes = Number(document.getElementById("biz-slot").value);
    var invalid = false;
    event.preventDefault();
    if (!name) {
      message.textContent = "צריך שם עסק.";
      return;
    }
    if (!(slotMinutes >= 15 && slotMinutes <= 180)) {
      message.textContent = "משך ברירת המחדל צריך להיות בין 15 ל־180 דקות.";
      return;
    }
    each(event.target.querySelectorAll("[data-service]"), function (input) {
      var id = input.getAttribute("data-service");
      var field = input.getAttribute("data-field");
      var value = Number(input.value);
      if (!current.services[id]) {
        return;
      }
      if (field === "minutes" && !(value >= 15 && value <= 180)) {
        invalid = true;
      }
      if (field === "price" && (input.value === "" || value < 0 || value > 9999)) {
        invalid = true;
      }
      if (!invalid && field === "minutes") {
        current.services[id].minutes = value;
      }
      if (!invalid && field === "price") {
        current.services[id].priceIls = value;
      }
    });
    if (invalid) {
      message.textContent = "בדקו מחיר ומספר דקות. מחיר הוא מספר בין 0 ל־9999, ומשך הוא בין 15 ל־180.";
      return;
    }
    try {
      localStorage.setItem(settingsKey, JSON.stringify({
        temporary: true,
        syncedWithCustomers: false,
        name: name,
        slotMinutes: slotMinutes,
        services: current.services
      }));
    } catch (error) {
      message.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    message.textContent = "ההגדרות נשמרו במכשיר זה בלבד. מחירי עמודי הלקוח ומשך התורים שם לא השתנו.";
  });

  each(document.querySelectorAll("[data-admin-panel]"), function (button) {
    button.addEventListener("click", function () {
      showPanel(button.getAttribute("data-admin-panel"));
    });
  });
  each(document.querySelectorAll("[data-request-filter]"), function (button) {
    button.addEventListener("click", function () {
      requestFilter = button.getAttribute("data-request-filter");
      each(document.querySelectorAll("[data-request-filter]"), function (item) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      paintRequests();
    });
  });

  var knownPanels = { dashboard: true, requests: true, calendar: true, approved: true, settings: true };
  var opening = String(window.location.hash || "").replace("#", "");
  if (!knownPanels[opening]) {
    opening = "dashboard";
  }
  loadWeek();
  paintException();
  fillSettings();
  showPanel(opening);
})();
