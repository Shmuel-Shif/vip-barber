(function () {
  "use strict";

  if (!document.body.classList.contains("admin")) {
    return;
  }

  var loginForm = document.getElementById("admin-login-form");
  var passwordInput = document.getElementById("admin-password");
  var passwordToggle = document.getElementById("admin-password-toggle");
  var loginError = document.getElementById("admin-login-error");
  var usernameInput = document.getElementById("admin-username");
  var fixedUsername = window.VIP_DEMO && window.VIP_DEMO.owner && window.VIP_DEMO.owner.adminUsername
    ? window.VIP_DEMO.owner.adminUsername
    : "zeevi";

  if (usernameInput) {
    usernameInput.value = fixedUsername;
  }

  function showLoginError(message) {
    if (!loginError) {
      return;
    }
    loginError.hidden = false;
    loginError.textContent = message;
  }

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", function () {
      var revealed = passwordInput.getAttribute("type") === "text";
      passwordInput.setAttribute("type", revealed ? "password" : "text");
      passwordToggle.textContent = revealed ? "הצגה" : "הסתרה";
      passwordToggle.setAttribute("aria-pressed", revealed ? "false" : "true");
      passwordToggle.setAttribute("aria-label", revealed ? "הצגת הסיסמה" : "הסתרת הסיסמה");
    });
  }

  var devOpen = document.getElementById("admin-dev-open");
  var devExit = document.getElementById("admin-dev-exit");
  var devKey = "vip-admin-dev-open";

  function openAdminForDevelopment() {
    var app = document.getElementById("admin-app");
    var login = document.getElementById("admin-login");
    document.body.classList.remove("admin-locked");
    if (login) {
      login.hidden = true;
    }
    if (app) {
      app.hidden = false;
    }
    if (devExit) {
      devExit.hidden = false;
    }
    try {
      sessionStorage.setItem(devKey, "1");
    } catch (error) {
      return;
    }
  }

  function closeAdminDevelopment() {
    var app = document.getElementById("admin-app");
    var login = document.getElementById("admin-login");
    document.body.classList.add("admin-locked");
    if (login) {
      login.hidden = false;
    }
    if (app) {
      app.hidden = true;
    }
    if (devExit) {
      devExit.hidden = true;
    }
    try {
      sessionStorage.removeItem(devKey);
    } catch (error) {
      return;
    }
  }

  if (devOpen) {
    devOpen.addEventListener("click", openAdminForDevelopment);
  }
  if (devExit) {
    devExit.addEventListener("click", closeAdminDevelopment);
  }
  try {
    if (sessionStorage.getItem(devKey) === "1") {
      openAdminForDevelopment();
    }
  } catch (error) {
    /* This browser blocked sessionStorage. The dev button still opens the admin. */
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      var username = usernameInput ? usernameInput.value.trim() : "";
      var passwordMissing = !passwordInput || passwordInput.value.length === 0;
      event.preventDefault();
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.setAttribute("type", "password");
      }
      if (passwordToggle) {
        passwordToggle.textContent = "הצגה";
        passwordToggle.setAttribute("aria-pressed", "false");
        passwordToggle.setAttribute("aria-label", "הצגת הסיסמה");
      }
      if (!username) {
        showLoginError("יש למלא את שם המשתמש.");
        return;
      }
      if (passwordMissing) {
        showLoginError("יש למלא את הסיסמה.");
        return;
      }
      if (username !== fixedUsername) {
        showLoginError("אין הרשמה למנהלים. חשבון המנהל הקבוע הוא " + fixedUsername + ".");
        return;
      }
      showLoginError("ההתחברות עדיין לא מחוברת. זה מסך עיצוב בלבד ולא אבטחה: הסיסמה לא נבדקת ולא נשמרת. אזור הניהול יישאר סגור עד חיבור Supabase, ואז האימות והרשאת המנהל ייבדקו בשרת.");
    });
  }

  var root = document.getElementById("week-days");
  var schedule = window.VIP_SCHEDULE;
  var ordersApi = window.VIP_ORDERS;
  if (!root || !schedule || !ordersApi) {
    return;
  }

  var settingsKey = "vip-business-settings";
  var months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  var weekNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var paymentNames = { paybox: "PayBox", cash: "מזומן", transfer: "העברה בנקאית" };
  var statusNames = { pending: "ממתין", approved: "מאושר", rejected: "נדחה", cancelled: "בוטל" };
  var today = new Date();
  var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
  var dayCursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var week = {};
  var exceptions = {};
  var hoursMode = "standing";
  var weekIsOverride = false;
  var openDay = "";
  var openOrder = "";
  var cancelId = "";

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
    return schedule.readStore();
  }

  function writeAvailability(stored) {
    exceptions = stored.exceptions || {};
    schedule.writeStore(stored);
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

  function weekDate(dayId) {
    return new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + Number(dayId));
  }

  function loadWeek() {
    var stored = readAvailability();
    exceptions = stored.exceptions;
    var saved = stored.weeks[iso(cursor)] || null;
    weekIsOverride = !!saved;
    week = blankWeek();
    schedule.weekdays.forEach(function (day) {
      var dateValue = iso(weekDate(day.id));
      if (hoursMode === "standing") {
        week[day.id] = schedule.standingDay(day.id, stored);
        week[day.id].blocked = [];
        return;
      }
      if (stored.exceptions[dateValue]) {
        weekIsOverride = true;
        week[day.id] = normalizeDay(stored.exceptions[dateValue]);
      } else if (saved && saved[day.id]) {
        week[day.id] = normalizeDay(saved[day.id]);
      } else {
        week[day.id] = schedule.standingDay(day.id, stored);
        week[day.id].blocked = [];
      }
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
    if (!item || item.status !== "hours") {
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
      statusNode.textContent = "יש שינויים שעדיין לא נשמרו.";
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
    if (order.adults) {
      var adultPrice = price("mens-haircut");
      parts.push(order.adults + " תספורת גברים" + (adultPrice === null ? "" : " (" + (order.adults * adultPrice) + " ₪)"));
    }
    if (order.children) {
      var childPrice = price("kids-haircut");
      parts.push(order.children + " תספורת ילדים" + (childPrice === null ? "" : " (" + (order.children * childPrice) + " ₪)"));
    }
    if (order.beards) {
      var beardPrice = price("beard");
      parts.push(order.beards + " סידור זקן" + (beardPrice === null ? "" : " (" + (order.beards * beardPrice) + " ₪)"));
    }
    return parts.join(" · ") || "לא צוינו שירותים";
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

  function timeInput(value, disabled, onChange) {
    var input = document.createElement("input");
    input.type = "time";
    input.value = value || "";
    input.disabled = !!disabled;
    input.addEventListener("change", function () {
      onChange(input.value);
    });
    return input;
  }

  function breakEditor(list, disabled, onChange) {
    var box = document.createElement("div");
    paragraph(box, "הפסקות", "admin-kicker");
    list.forEach(function (br, index) {
      var row = document.createElement("div");
      row.className = "admin-break";
      [["start", "התחלה"], ["end", "סיום"]].forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field[1];
        wrap.appendChild(timeInput(br[field[0]], disabled, function (value) {
          list[index][field[0]] = value;
          onChange();
        }));
        row.appendChild(wrap);
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost";
      remove.textContent = "הסרת הפסקה";
      remove.addEventListener("click", function () {
        list.splice(index, 1);
        onChange();
        renderWeek();
      });
      row.appendChild(remove);
      box.appendChild(row);
    });
    var add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn--ghost";
    add.textContent = "הוספת הפסקה";
    add.addEventListener("click", function () {
      list.push({ start: "", end: "" });
      onChange();
      renderWeek();
    });
    box.appendChild(add);
    return box;
  }

  function blockEditor(item, onChange) {
    var box = document.createElement("div");
    paragraph(box, "שעות חסומות", "admin-kicker");
    var slots = item.status === "hours" ? slotsBetween(item.start, item.end) : [];
    if (!slots.length) {
      paragraph(box, "אחרי שעת התחלה וסיום אפשר לחסום שעות של חצי שעה.");
      return box;
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
      button.addEventListener("click", function () {
        var place = item.blocked.indexOf(slot);
        if (place === -1) {
          item.blocked.push(slot);
        } else {
          item.blocked.splice(place, 1);
        }
        onChange();
        renderWeek();
      });
      grid.appendChild(button);
    });
    box.appendChild(grid);
    return box;
  }

  function renderWeek() {
    var label = document.getElementById("week-label");
    var scope = document.getElementById("hours-scope");
    var nav = document.getElementById("week-nav");
    var saveButton = document.getElementById("week-save");
    var clearButton = document.getElementById("week-clear");
    var standingButton = document.getElementById("hours-standing");
    var weekButton = document.getElementById("hours-week");
    var end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6);
    if (label) {
      label.textContent = cursor.getDate() + " ב" + months[cursor.getMonth()] + " – " + end.getDate() + " ב" + months[end.getMonth()];
    }
    if (nav) {
      nav.hidden = hoursMode !== "week";
    }
    if (standingButton) {
      standingButton.setAttribute("aria-pressed", hoursMode === "standing" ? "true" : "false");
    }
    if (weekButton) {
      weekButton.setAttribute("aria-pressed", hoursMode === "week" ? "true" : "false");
    }
    if (saveButton) {
      saveButton.textContent = hoursMode === "standing" ? "שמירת השעות הקבועות" : "שמירת השינוי לשבוע הזה";
    }
    if (clearButton) {
      clearButton.hidden = hoursMode !== "week" || !weekIsOverride;
    }
    if (scope) {
      if (hoursMode === "standing") {
        scope.textContent = "אלה שעות קבועות. הן חוזרות בכל שבוע שאין לו שינוי חריג.";
      } else if (weekIsOverride) {
        scope.textContent = "שינוי חריג לשבוע שנבחר. שאר השבועות נשארים לפי השעות הקבועות.";
      } else {
        scope.textContent = "השבוע הזה עדיין לפי השעות הקבועות. שמירה כאן תחול רק על השבוע שנבחר.";
      }
    }
    root.textContent = "";
    schedule.weekdays.forEach(function (day) {
      var date = weekDate(day.id);
      var item = week[day.id];
      var open = item.status === "hours";
      var card = document.createElement("article");
      card.className = "admin-hour";

      var bar = document.createElement("div");
      bar.className = "admin-hour__bar";
      var name = document.createElement("button");
      name.type = "button";
      name.className = "admin-hour__name";
      name.textContent = hoursMode === "week"
        ? "יום " + day.label + ", " + date.getDate() + " ב" + months[date.getMonth()]
        : "יום " + day.label;
      name.setAttribute("aria-expanded", openDay === day.id ? "true" : "false");
      name.addEventListener("click", function () {
        openDay = openDay === day.id ? "" : day.id;
        renderWeek();
      });
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "admin-switch";
      toggle.textContent = open ? "פתוח" : "סגור";
      toggle.setAttribute("aria-pressed", open ? "true" : "false");
      toggle.setAttribute("aria-label", "יום " + day.label + (open ? " פתוח" : " סגור"));
      toggle.addEventListener("click", function () {
        item.status = open ? "closed" : "hours";
        markDirty();
        renderWeek();
      });
      bar.appendChild(name);
      bar.appendChild(toggle);
      card.appendChild(bar);

      var times = document.createElement("div");
      times.className = "admin-hour__times";
      [["start", "התחלה"], ["end", "סיום"]].forEach(function (field) {
        var wrap = document.createElement("label");
        wrap.textContent = field[1];
        wrap.appendChild(timeInput(item[field[0]], !open, function (value) {
          item[field[0]] = value;
          markDirty();
        }));
        times.appendChild(wrap);
      });
      card.appendChild(times);

      if (openDay === day.id) {
        var more = document.createElement("div");
        more.className = "admin-hour__more";
        more.appendChild(breakEditor(item.breaks, !open, markDirty));
        if (hoursMode === "week") {
          more.appendChild(blockEditor(item, markDirty));
        }
        card.appendChild(more);
      }
      root.appendChild(card);
    });
  }

  function cleanWeek() {
    var days = {};
    schedule.weekdays.forEach(function (day) {
      var item = week[day.id];
      days[day.id] = {
        status: item.status === "hours" ? "hours" : "closed",
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

  function paintConflicts() {
    var box = document.getElementById("week-conflicts");
    var ordersApi = window.VIP_ORDERS;
    var dates = {};
    if (!box) {
      return;
    }
    box.textContent = "";
    if (hoursMode === "week") {
      schedule.weekdays.forEach(function (day) {
        dates[iso(weekDate(day.id))] = true;
      });
    }
    if (!ordersApi) {
      return;
    }
    ordersApi.read().forEach(function (order) {
      var date;
      var slots;
      if (!order || (order.status !== "pending" && order.status !== "approved") || !order.date || !order.time) {
        return;
      }
      if (hoursMode === "week" && !dates[order.date]) {
        return;
      }
      date = new Date(Number(order.date.slice(0, 4)), Number(order.date.slice(5, 7)) - 1, Number(order.date.slice(8, 10)));
      slots = schedule.openSlots(date, { ignoreTaken: true, ignorePast: true });
      if (slots.indexOf(order.time) !== -1) {
        return;
      }
      if (!box.childNodes.length) {
        paragraph(box, "התורים האלה נשארו כפי שהם ולא בוטלו, אבל הם מחוץ לשעות המעודכנות במכשיר זה:");
      }
      paragraph(box, whenText(order) + " — " + ((order.customer && order.customer.fullName) || "בלי שם"));
    });
  }

  function saveWeek() {
    var statusNode = document.getElementById("week-status");
    var invalid = false;
    var stored;
    schedule.weekdays.forEach(function (day) {
      if (!dayHoursValid(week[day.id])) {
        invalid = true;
      }
    });
    if (invalid) {
      statusNode.textContent = "ביום פתוח צריך שעת התחלה, שעת סיום מאוחרת ממנה, והפסקות בתוך הטווח.";
      return;
    }
    stored = readAvailability();
    if (hoursMode === "standing") {
      stored.standing = cleanWeek();
      schedule.weekdays.forEach(function (day) {
        stored.standing[day.id].blocked = [];
      });
    } else {
      stored.weeks[iso(cursor)] = cleanWeek();
      schedule.weekdays.forEach(function (day) {
        delete stored.exceptions[iso(weekDate(day.id))];
      });
    }
    try {
      writeAvailability(stored);
    } catch (error) {
      statusNode.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    if (hoursMode === "week") {
      weekIsOverride = true;
    }
    if (hoursMode === "standing") {
      statusNode.textContent = "השעות הקבועות נשמרו במכשיר זה. לוח הלקוח במכשיר זה ישתמש בהן. אין סנכרון בין מכשירים, והתורים הקיימים לא בוטלו.";
    } else {
      statusNode.textContent = "השינוי נשמר רק לשבוע שנבחר, במכשיר זה. השעות הקבועות לא השתנו, ואין סנכרון בין מכשירים. התורים הקיימים לא בוטלו.";
    }
    renderWeek();
    paintConflicts();
  }

  function clearWeekOverride() {
    var statusNode = document.getElementById("week-status");
    var stored = readAvailability();
    delete stored.weeks[iso(cursor)];
    schedule.weekdays.forEach(function (day) {
      delete stored.exceptions[iso(weekDate(day.id))];
    });
    try {
      writeAvailability(stored);
    } catch (error) {
      statusNode.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    weekIsOverride = false;
    loadWeek();
    statusNode.textContent = "השבוע חזר לשעות הקבועות. התורים הקיימים לא בוטלו.";
    renderWeek();
    paintConflicts();
  }

  function detailLines(order) {
    var customer = order.customer || {};
    var lines = [serviceText(order)];
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
    if (order.cancelledBy === "customer") {
      lines.push("בוטל על ידי הלקוח. ההתראה שמורה במכשיר זה ועדיין לא נשלחת.");
    }
    return lines;
  }

  function compactCard(order, actions) {
    var customer = order.customer || {};
    var card = document.createElement("article");
    var toggle = document.createElement("button");
    var body = document.createElement("div");
    var expanded = openOrder === order.id;
    card.className = "admin-compact is-" + (statusNames[order.status] ? order.status : "pending");
    toggle.type = "button";
    toggle.className = "admin-compact__toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.textContent = (order.time || "בלי שעה") + " · " + (customer.fullName || "ללא שם") + (customer.phone ? " · " + customer.phone : "") + " · " + (statusNames[order.status] || "ממתין");
    toggle.addEventListener("click", function () {
      openOrder = expanded ? "" : order.id;
      paintOrders();
      paintDay();
      paintPending();
    });
    body.className = "admin-compact__body";
    body.hidden = !expanded;
    detailLines(order).forEach(function (line) {
      paragraph(body, line);
    });
    if (order.photo && expanded) {
      var image = document.createElement("img");
      image.src = order.photo;
      image.alt = "תמונת הכניסה לבניין";
      body.appendChild(image);
    }
    card.appendChild(toggle);
    if (actions && expanded) {
      body.appendChild(actions);
    }
    card.appendChild(body);
    if (actions && !expanded) {
      card.appendChild(actions);
    }
    return card;
  }

  function actionRow(order, mode) {
    var row = document.createElement("div");
    row.className = "admin-actions";
    if (mode === "pending" && order.status === "pending") {
      var approve = document.createElement("button");
      var reject = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--gold";
      approve.textContent = "אישור";
      approve.addEventListener("click", function () {
        ordersApi.approve(order.id);
        setFeedback("התור סומן כמאושר במכשיר זה בלבד. לא נשלחה התראה.");
        refreshLists();
      });
      reject.type = "button";
      reject.className = "btn btn--ghost";
      reject.textContent = "דחייה";
      reject.addEventListener("click", function () {
        ordersApi.reject(order.id);
        setFeedback("הבקשה סומנה כנדחתה במכשיר זה בלבד. לא נשלחה התראה.");
        refreshLists();
      });
      row.appendChild(approve);
      row.appendChild(reject);
      return row;
    }
    if (order.status === "approved") {
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn--ghost";
      cancel.textContent = "ביטול התור";
      cancel.addEventListener("click", function () {
        askCancel(order);
      });
      row.appendChild(cancel);
      return row;
    }
    return null;
  }

  function paintDay() {
    var label = document.getElementById("day-label");
    var list = document.getElementById("day-list");
    if (!label || !list) {
      return;
    }
    label.textContent = weekNames[dayCursor.getDay()] + ", " + dayCursor.getDate() + " ב" + months[dayCursor.getMonth()];
    var items = ordersApi.read().filter(function (order) {
      return order.date === iso(dayCursor) && order.status !== "rejected" && order.status !== "cancelled";
    }).sort(function (a, b) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    });
    list.textContent = "";
    if (!items.length) {
      paragraph(list, "אין תורים ביום הזה במכשיר זה.", "orders-empty");
      return;
    }
    items.forEach(function (order) {
      list.appendChild(compactCard(order, actionRow(order, "day")));
    });
  }

  function filteredOrders() {
    var status = document.getElementById("orders-status");
    var date = document.getElementById("orders-date");
    var search = document.getElementById("orders-search");
    var statusValue = status ? status.value : "all";
    var dateValue = date ? date.value : "";
    var query = search ? search.value.trim() : "";
    return ordersApi.read().filter(function (order) {
      var customer = order.customer || {};
      if (statusValue !== "all" && order.status !== statusValue) {
        return false;
      }
      if (dateValue && order.date !== dateValue) {
        return false;
      }
      if (!query) {
        return true;
      }
      var haystack = (customer.fullName || "") + " " + (customer.phone || "");
      return haystack.indexOf(query) !== -1;
    });
  }

  function paintOrders() {
    var list = document.getElementById("orders-admin-list");
    if (!list) {
      return;
    }
    var items = filteredOrders();
    list.textContent = "";
    if (!items.length) {
      paragraph(list, "אין הזמנות במכשיר זה לפי הסינון שנבחר.", "orders-empty");
      return;
    }
    items.forEach(function (order) {
      list.appendChild(compactCard(order, actionRow(order, "orders")));
    });
  }

  function paintPending() {
    var list = document.getElementById("pending-list");
    if (!list) {
      return;
    }
    var items = ordersApi.read().filter(function (order) {
      return order.status === "pending";
    });
    list.textContent = "";
    if (!items.length) {
      paragraph(list, "אין בקשות ממתינות במכשיר זה.", "orders-empty");
      return;
    }
    items.forEach(function (order) {
      var customer = order.customer || {};
      var card = document.createElement("article");
      card.className = "admin-compact is-pending";
      paragraph(card, whenText(order), "admin-when");
      paragraph(card, (customer.fullName || "ללא שם") + (customer.phone ? " · " + customer.phone : ""));
      paragraph(card, serviceText(order));
      var actions = actionRow(order, "pending");
      if (actions) {
        card.appendChild(actions);
      }
      list.appendChild(card);
    });
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
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("article");
      var button = document.createElement("button");
      card.className = "admin-compact is-cancelled";
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

  function setFeedback(text) {
    var pending = document.getElementById("pending-feedback");
    var orders = document.getElementById("orders-feedback");
    if (pending) {
      pending.textContent = text;
    }
    if (orders) {
      orders.textContent = text;
    }
  }

  function refreshLists() {
    paintDay();
    paintOrders();
    paintPending();
    paintNotices();
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
    var aliases = { dashboard: "day", requests: "pending", calendar: "hours", approved: "orders" };
    var panels = { hours: true, day: true, orders: true, pending: true, settings: true };
    if (aliases[name]) {
      name = aliases[name];
    }
    if (!panels[name]) {
      name = "day";
    }
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
    if (name === "hours") {
      renderWeek();
    }
    if (name === "day" || name === "orders" || name === "pending") {
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
    openDay = "";
    loadWeek();
    document.getElementById("week-status").textContent = "";
    renderWeek();
  });
  document.getElementById("week-next").addEventListener("click", function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    openDay = "";
    loadWeek();
    document.getElementById("week-status").textContent = "";
    renderWeek();
  });
  document.getElementById("week-save").addEventListener("click", saveWeek);
  document.getElementById("week-clear").addEventListener("click", clearWeekOverride);
  document.getElementById("hours-standing").addEventListener("click", function () {
    hoursMode = "standing";
    openDay = "";
    loadWeek();
    document.getElementById("week-status").textContent = "";
    document.getElementById("week-conflicts").textContent = "";
    renderWeek();
  });
  document.getElementById("hours-week").addEventListener("click", function () {
    hoursMode = "week";
    openDay = "";
    loadWeek();
    document.getElementById("week-status").textContent = "";
    document.getElementById("week-conflicts").textContent = "";
    renderWeek();
  });
  document.getElementById("day-prev").addEventListener("click", function () {
    dayCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), dayCursor.getDate() - 1);
    openOrder = "";
    paintDay();
  });
  document.getElementById("day-next").addEventListener("click", function () {
    dayCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), dayCursor.getDate() + 1);
    openOrder = "";
    paintDay();
  });
  ["orders-status", "orders-date", "orders-search"].forEach(function (id) {
    var field = document.getElementById(id);
    if (!field) {
      return;
    }
    field.addEventListener("input", paintOrders);
    field.addEventListener("change", paintOrders);
  });
  document.getElementById("admin-confirm-yes").addEventListener("click", function () {
    var dialog = document.getElementById("admin-confirm");
    if (cancelId) {
      ordersApi.cancel(cancelId, { by: "admin" });
      cancelId = "";
      setFeedback("התור סומן כבוטל במכשיר זה בלבד. לא נשלחה התראה.");
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

  loadWeek();
  fillSettings();
  showPanel(String(window.location.hash || "").replace("#", ""));
})();
