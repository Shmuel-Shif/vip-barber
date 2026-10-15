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
  var serverMode = false;
  var serverCatalog = null;

  function showLoginError(message) {
    if (!loginError) {
      return;
    }
    loginError.hidden = false;
    loginError.textContent = message;
  }

  function blankLoginField(input) {
    if (!input) {
      return;
    }
    input.setAttribute("readonly", "readonly");
    input.value = "";
    input.addEventListener("focus", function () {
      input.removeAttribute("readonly");
    });
    window.setTimeout(function () {
      if (document.activeElement !== input) {
        input.value = "";
      }
    }, 80);
    window.setTimeout(function () {
      if (document.activeElement !== input) {
        input.value = "";
      }
    }, 600);
  }

  blankLoginField(usernameInput);
  blankLoginField(passwordInput);

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", function () {
      var revealed = passwordInput.getAttribute("type") === "text";
      passwordInput.setAttribute("type", revealed ? "password" : "text");
      passwordToggle.setAttribute("aria-pressed", revealed ? "false" : "true");
      passwordToggle.setAttribute("aria-label", revealed ? "הצגת הסיסמה" : "הסתרת הסיסמה");
    });
  }

  var devExit = document.getElementById("admin-dev-exit");

  function showAdmin() {
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
  }

  function closeAdminDevelopment() {
    var app = document.getElementById("admin-app");
    var login = document.getElementById("admin-login");
    var signingOut = serverMode;
    serverMode = false;
    if (window.VIP_ORDERS && window.VIP_ORDERS.watchServer) {
      window.VIP_ORDERS.watchServer(false);
    }
    if (window.VIP_SUPABASE && window.VIP_SUPABASE.stopOrdersWatch) {
      window.VIP_SUPABASE.stopOrdersWatch();
    }
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
    if (signingOut && window.VIP_SUPABASE && window.VIP_SUPABASE.signOut) {
      window.VIP_SUPABASE.signOut();
    }
  }

  if (devExit) {
    devExit.addEventListener("click", closeAdminDevelopment);
  }

  function openServerAdmin() {
    serverMode = true;
    showAdmin();
    loadServerSchedule();
    loadServerPrices();
    if (!window.VIP_ORDERS || !window.VIP_ORDERS.reloadAccount) {
      return;
    }
    window.VIP_ORDERS.watchServer(true);
    if (window.VIP_SUPABASE && window.VIP_SUPABASE.watchOrders) {
      window.VIP_SUPABASE.watchOrders(function () {
        if (!serverMode || !window.VIP_ORDERS || !window.VIP_ORDERS.reloadAccount) {
          return null;
        }
        return window.VIP_ORDERS.reloadAccount().then(function (result) {
          if (!serverMode || !result || result.error) {
            return;
          }
          refreshLists();
        });
      });
    }
    window.VIP_ORDERS.reloadAccount().then(function (result) {
      if (result && result.error) {
        setFeedback(result.error);
      }
      if (typeof refreshLists === "function") {
        refreshLists();
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      var username = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
      var password = passwordInput ? passwordInput.value : "";
      var auth = window.VIP_SUPABASE;
      event.preventDefault();
      if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) {
        showLoginError("שם המשתמש צריך 3–24 תווים באנגלית, ספרות או _.");
        return;
      }
      if (!password) {
        showLoginError("יש למלא את הסיסמה.");
        return;
      }
      if (!auth || !auth.signInWithUsername || !auth.profile) {
        showLoginError("החיבור לשרת לא נטען בעמוד.");
        return;
      }
      showLoginError("בודקים את החשבון...");
      auth.signInWithUsername(username, password).then(function (result) {
        if (passwordInput) {
          passwordInput.value = "";
          passwordInput.setAttribute("type", "password");
        }
        if (passwordToggle) {
          passwordToggle.setAttribute("aria-pressed", "false");
          passwordToggle.setAttribute("aria-label", "הצגת הסיסמה");
        }
        if (!result || result.error || !result.session) {
          showLoginError(result && result.error ? result.error : "שם המשתמש או הסיסמה לא נכונים.");
          return null;
        }
        return auth.profile();
      }).then(function (result) {
        if (!result) {
          return;
        }
        if (result.error || !result.profile || result.profile.role !== "admin") {
          if (auth.signOut) {
            auth.signOut();
          }
          showLoginError(result.profile && result.profile.role !== "admin" ? "החשבון הזה אינו אדמין." : (result.error || "החשבון הזה אינו אדמין."));
          return;
        }
        if (loginError) {
          loginError.hidden = true;
        }
        openServerAdmin();
      });
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
    if (serverMode && schedule.remote) {
      return {
        standing: schedule.remote.standing || {},
        weeks: schedule.remote.weeks || {},
        exceptions: schedule.remote.exceptions || {}
      };
    }
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
        scope.textContent = "אלה שעות קבועות. שבת סגורה. הן חוזרות בכל שבוע שאין לו שינוי חריג.";
      } else if (weekIsOverride) {
        scope.textContent = "שינוי חריג לשבוע שנבחר. שאר השבועות נשארים לפי השעות הקבועות.";
      } else {
        scope.textContent = "השבוע הזה עדיין לפי השעות הקבועות. שמירה כאן תחול רק על השבוע שנבחר.";
      }
    }
    root.textContent = "";
    schedule.weekdays.forEach(function (day) {
      if (hoursMode === "standing" && day.id === "6") {
        return;
      }
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

  function clock(value) {
    var text = String(value || "");
    return text.length >= 5 ? text.slice(0, 5) : "";
  }

  function shiftIso(value, days) {
    var parts = String(value || "").split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days);
    return iso(date);
  }

  function closeSaturday(days) {
    days["6"] = {
      status: "closed",
      start: "",
      end: "",
      blocked: [],
      breaks: []
    };
    return days;
  }

  function rowsFor(weekStart, days, keepBlocked) {
    return schedule.weekdays.map(function (day) {
      var item = days[day.id];
      var open = item.status === "hours";
      var row = {
        weekday: Number(day.id),
        status: open ? "hours" : "closed",
        start_time: open ? clock(item.start) : null,
        end_time: open ? clock(item.end) : null,
        breaks: open ? item.breaks.filter(function (br) {
          return br.start && br.end;
        }).map(function (br) {
          return { start: clock(br.start), end: clock(br.end) };
        }) : [],
        blocked: open && keepBlocked ? item.blocked.map(clock).filter(Boolean) : []
      };
      if (weekStart) {
        row.week_start = weekStart;
      }
      return row;
    });
  }

  function reloadServerSchedule(statusNode, successText) {
    var auth = window.VIP_SUPABASE;
    if (!auth || !auth.fetchSchedule) {
      statusNode.textContent = "לא ניתן לטעון את השעות מהשרת.";
      return Promise.resolve();
    }
    return auth.fetchSchedule().then(function (result) {
      if (!serverMode) {
        return false;
      }
      if (!result || result.error || !result.schedule || !result.schedule.weekly || !result.schedule.weekly.length || !schedule.applyRemote) {
        statusNode.textContent = result && result.error ? result.error : "לא ניתן לטעון את השעות מהשרת.";
        return false;
      }
      schedule.applyRemote(result.schedule, []);
      var travelInput = document.getElementById("biz-travel");
      if (travelInput && typeof schedule.travelMinutes === "number" && travelInput.getAttribute("data-touched") !== "true") {
        travelInput.value = String(schedule.travelMinutes);
      }
      loadWeek();
      if (successText) {
        statusNode.textContent = successText;
      }
      renderWeek();
      paintConflicts();
      return true;
    }).catch(function () {
      statusNode.textContent = "לא ניתן לטעון את השעות מהשרת.";
      return false;
    });
  }

  function loadServerSchedule() {
    var statusNode = document.getElementById("week-status");
    if (!statusNode) {
      return;
    }
    statusNode.textContent = "טוענים את השעות מהשרת...";
    reloadServerSchedule(statusNode, "");
  }

  function loadServerPrices() {
    var auth = window.VIP_SUPABASE;
    var message = document.getElementById("biz-status");
    if (!auth || !auth.fetchCatalog) {
      if (message) {
        message.textContent = "לא ניתן לטעון את המחירים מהשרת.";
      }
      return;
    }
    auth.fetchCatalog().then(function (result) {
      if (!serverMode) {
        return;
      }
      if (!result || result.error || !result.rows || !result.rows.length) {
        if (message) {
          message.textContent = result && result.error ? result.error : "לא ניתן לטעון את המחירים מהשרת.";
        }
        return;
      }
      serverCatalog = result.rows || [];
      if (window.VIP_DEMO && window.VIP_DEMO.applyServer) {
        window.VIP_DEMO.applyServer(serverCatalog);
      }
      fillSettings();
      refreshLists();
      if (message) {
        message.textContent = "";
      }
    }).catch(function () {
      if (message) {
        message.textContent = "לא ניתן לטעון את המחירים מהשרת.";
      }
    });
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
        paragraph(box, serverMode
          ? "התורים האלה נשארו כפי שהם ולא בוטלו, אבל הם מחוץ לשעות המעודכנות:"
          : "התורים האלה נשארו כפי שהם ולא בוטלו, אבל הם מחוץ לשעות המעודכנות במכשיר זה:");
      }
      paragraph(box, whenText(order) + " — " + ((order.customer && order.customer.fullName) || "בלי שם"));
    });
  }

  function saveWeek() {
    var statusNode = document.getElementById("week-status");
    var invalid = false;
    var stored;
    if (hoursMode === "standing") {
      closeSaturday(week);
    }
    schedule.weekdays.forEach(function (day) {
      if (!dayHoursValid(week[day.id])) {
        invalid = true;
      }
    });
    if (invalid) {
      statusNode.textContent = "ביום פתוח צריך שעת התחלה, שעת סיום מאוחרת ממנה, והפסקות בתוך הטווח.";
      return;
    }
    if (serverMode && !schedule.remote) {
      statusNode.textContent = "לא ניתן לשמור לפני שהשעות נטענו מהשרת.";
      return;
    }
    if (serverMode) {
      var auth = window.VIP_SUPABASE;
      var days = cleanWeek();
      var weekStart = iso(cursor);
      if (hoursMode === "standing") {
        schedule.weekdays.forEach(function (day) {
          days[day.id].blocked = [];
        });
        closeSaturday(days);
      }
      if (!auth || !auth.saveWeeklyHours || !auth.saveWeekOverride) {
        statusNode.textContent = "לא ניתן לשמור את השעות בשרת.";
        return;
      }
      var request = hoursMode === "standing"
        ? auth.saveWeeklyHours(rowsFor("", days, false))
        : auth.saveWeekOverride(weekStart, shiftIso(weekStart, 6), rowsFor(weekStart, days, true));
      request.then(function (result) {
        if (!result || result.error) {
          statusNode.textContent = result && result.error ? result.error : "לא ניתן לשמור את השעות בשרת.";
          return null;
        }
        if (hoursMode === "week") {
          weekIsOverride = true;
        }
        return reloadServerSchedule(statusNode, hoursMode === "standing"
          ? "השעות הקבועות נשמרו בשרת. תורים שכבר נקבעו לא בוטלו."
          : "השבוע שנבחר נשמר בשרת. השעות הקבועות לא השתנו, וחריגי התאריך של השבוע הוסרו. תורים שכבר נקבעו לא בוטלו.").then(function (ok) {
          if (!ok) {
            statusNode.textContent = "השמירה נשלחה לשרת, אבל לא ניתן לטעון מחדש את השעות.";
          }
        });
      }).catch(function () {
        statusNode.textContent = "לא ניתן לשמור את השעות בשרת.";
      });
      return;
    }
    stored = readAvailability();
    if (hoursMode === "standing") {
      stored.standing = closeSaturday(cleanWeek());
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
      statusNode.textContent = "השעות הקבועות נשמרו. התורים הקיימים לא בוטלו.";
    } else {
      statusNode.textContent = "השינוי נשמר לשבוע שנבחר. השעות הקבועות לא השתנו, והתורים הקיימים לא בוטלו.";
    }
    renderWeek();
    paintConflicts();
  }

  function clearWeekOverride() {
    var statusNode = document.getElementById("week-status");
    var stored;
    if (serverMode && !schedule.remote) {
      statusNode.textContent = "לא ניתן לשמור לפני שהשעות נטענו מהשרת.";
      return;
    }
    if (serverMode) {
      var auth = window.VIP_SUPABASE;
      var weekStart = iso(cursor);
      if (!auth || !auth.clearWeekOverride) {
        statusNode.textContent = "לא ניתן לשמור את השעות בשרת.";
        return;
      }
      auth.clearWeekOverride(weekStart, shiftIso(weekStart, 6)).then(function (result) {
        if (!result || result.error) {
          statusNode.textContent = result && result.error ? result.error : "לא ניתן לשמור את השעות בשרת.";
          return;
        }
        weekIsOverride = false;
        reloadServerSchedule(statusNode, "השבוע חזר לשעות הקבועות בשרת. התורים הקיימים לא בוטלו.").then(function (ok) {
          if (!ok) {
            statusNode.textContent = "השמירה נשלחה לשרת, אבל לא ניתן לטעון מחדש את השעות.";
          }
        });
      }).catch(function () {
        statusNode.textContent = "לא ניתן לשמור את השעות בשרת.";
      });
      return;
    }
    stored = readAvailability();
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

  function addDetail(parent, label, value) {
    if (!value) {
      return;
    }
    var row = document.createElement("div");
    var name = document.createElement("span");
    var text = document.createElement("span");
    row.className = "admin-detail";
    name.className = "admin-detail__label";
    name.textContent = label;
    text.className = "admin-detail__value";
    text.textContent = value;
    row.appendChild(name);
    row.appendChild(text);
    parent.appendChild(row);
  }

  function fillDetails(parent, order) {
    var customer = order.customer || {};
    addDetail(parent, "שירות", serviceText(order));
    addDetail(parent, "כתובת", addressOf(customer));
    addDetail(parent, "כניסה", customer.entrance);
    addDetail(parent, "קומה", customer.floor);
    addDetail(parent, "דירה", customer.apartment);
    addDetail(parent, "קוד כניסה", customer.entryCode);
    addDetail(parent, "הערות", customer.notes);
    addDetail(parent, "תשלום", customer.payment && paymentNames[customer.payment]);
    if (order.cancelledBy === "customer") {
      addDetail(parent, "ביטול", "בוטל על ידי הלקוח.");
    }
  }

  function compactCard(order, actions) {
    var customer = order.customer || {};
    var card = document.createElement("article");
    var toggle = document.createElement("button");
    var top = document.createElement("span");
    var when = document.createElement("span");
    var badge = document.createElement("span");
    var name = document.createElement("span");
    var phone = document.createElement("span");
    var body = document.createElement("div");
    var expanded = openOrder === order.id;
    var status = statusNames[order.status] ? order.status : "pending";
    card.className = "admin-compact is-" + status;
    toggle.type = "button";
    toggle.className = "admin-compact__toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    top.className = "admin-compact__top";
    when.className = "admin-compact__when";
    when.textContent = dateLabel(order.date) + (order.time ? " · " + order.time : "");
    badge.className = "admin-compact__status is-" + status;
    badge.textContent = statusNames[status] || "ממתין";
    name.className = "admin-compact__name";
    name.textContent = customer.fullName || "ללא שם";
    phone.className = "admin-compact__phone";
    phone.textContent = customer.phone || "בלי טלפון";
    top.appendChild(when);
    top.appendChild(badge);
    toggle.appendChild(top);
    toggle.appendChild(name);
    toggle.appendChild(phone);
    toggle.addEventListener("click", function () {
      openOrder = expanded ? "" : order.id;
      paintOrders();
      paintDay();
      paintPending();
    });
    body.className = "admin-compact__body";
    body.hidden = !expanded;
    fillDetails(body, order);
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
        applyOrderAction(ordersApi.approve(order.id), "התור סומן כמאושר במכשיר זה בלבד. לא נשלחה התראה.", "התור אושר בשרת. לא נשלחה התראה.");
      });
      reject.type = "button";
      reject.className = "btn btn--ghost";
      reject.textContent = "דחייה";
      reject.addEventListener("click", function () {
        applyOrderAction(ordersApi.reject(order.id), "הבקשה סומנה כנדחתה במכשיר זה בלבד. לא נשלחה התראה.", "הבקשה נדחתה בשרת. לא נשלחה התראה.");
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
    syncToolMarks();
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

  function applyOrderAction(result, localText, serverText) {
    if (result && typeof result.then === "function") {
      result.then(function (outcome) {
        if (!outcome || outcome.error) {
          setFeedback(outcome && outcome.error ? outcome.error : "הפעולה נכשלה.");
          return;
        }
        setFeedback(serverText);
        refreshLists();
      });
      return;
    }
    setFeedback(localText);
    refreshLists();
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
    var panels = { day: true, orders: true, pending: true, settings: true };
    if (name === "hours" || name === "calendar") {
      name = "settings";
    }
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
    if (name === "settings") {
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
        if (item.minutes >= 10 && item.minutes <= 180) {
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
    var travel = 10;
    if (!form) {
      return;
    }
    if (serverCatalog) {
      serverCatalog.forEach(function (row) {
        if (!data.services[row.id]) {
          data.services[row.id] = { priceIls: null, minutes: 30 };
        }
        if (row.price_ils !== null && row.price_ils !== undefined) {
          data.services[row.id].priceIls = Number(row.price_ils);
        }
        if (row.minutes !== null && row.minutes !== undefined) {
          data.services[row.id].minutes = Number(row.minutes);
        }
      });
    }
    if (window.VIP_SCHEDULE && typeof window.VIP_SCHEDULE.travelMinutes === "number") {
      travel = window.VIP_SCHEDULE.travelMinutes;
    }
    document.getElementById("biz-cut").value = String(data.services["mens-haircut"] && data.services["mens-haircut"].minutes >= 10 ? data.services["mens-haircut"].minutes : 30);
    document.getElementById("biz-travel").value = String(travel);
    each(form.querySelectorAll("[data-service]"), function (input) {
      var service = data.services[input.getAttribute("data-service")];
      if (!service || input.getAttribute("data-field") !== "price") {
        return;
      }
      input.value = service.priceIls === null || service.priceIls === undefined ? "" : String(service.priceIls);
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
  function syncToolMarks() {
    var status = document.getElementById("orders-status");
    var date = document.getElementById("orders-date");
    var search = document.getElementById("orders-search");
    var statusButton = document.getElementById("tool-status");
    var dateButton = document.getElementById("tool-date");
    var searchButton = document.getElementById("tool-search");
    if (statusButton) {
      statusButton.classList.toggle("is-set", !!(status && status.value !== "all"));
    }
    if (dateButton) {
      dateButton.classList.toggle("is-set", !!(date && date.value));
    }
    if (searchButton) {
      searchButton.classList.toggle("is-set", !!(search && search.value.trim()));
    }
  }

  function openTool(id) {
    ["status", "date", "search"].forEach(function (name) {
      var button = document.getElementById("tool-" + name);
      var panel = document.getElementById("tool-" + name + "-panel");
      var open = name === id && button && button.getAttribute("aria-expanded") !== "true";
      if (button) {
        button.setAttribute("aria-expanded", open ? "true" : "false");
      }
      if (panel) {
        panel.hidden = !open;
      }
    });
  }

  ["status", "date", "search"].forEach(function (name) {
    var button = document.getElementById("tool-" + name);
    if (!button) {
      return;
    }
    button.addEventListener("click", function () {
      openTool(name);
    });
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
      applyOrderAction(ordersApi.cancel(cancelId, { by: "admin" }), "התור סומן כבוטל במכשיר זה בלבד. לא נשלחה התראה.", "התור בוטל בשרת. לא נשלחה התראה.");
      cancelId = "";
    }
    dialog.close();
  });
  document.getElementById("admin-confirm-no").addEventListener("click", function () {
    cancelId = "";
    document.getElementById("admin-confirm").close();
  });
  document.getElementById("biz-travel").addEventListener("input", function () {
    this.setAttribute("data-touched", "true");
  });
  document.getElementById("settings-toggle").addEventListener("click", function () {
    var body = document.getElementById("settings-body");
    var open = body.hidden;
    body.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("hours-toggle").addEventListener("click", function () {
    var body = document.getElementById("hours-body");
    var open = body.hidden;
    body.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      renderWeek();
    }
  });
  document.getElementById("business-form").addEventListener("submit", function (event) {
    var message = document.getElementById("biz-status");
    var current = readSettings();
    var cut = Number(document.getElementById("biz-cut").value);
    var travel = Number(document.getElementById("biz-travel").value);
    var beardMinutes = 10;
    var invalid = false;
    event.preventDefault();
    if (!(cut >= 10 && cut <= 180) || cut !== Math.round(cut)) {
      message.textContent = "זמן התספורת צריך להיות בין 10 ל־180 דקות.";
      return;
    }
    if (!(travel >= 0 && travel <= 180) || travel !== Math.round(travel)) {
      message.textContent = "זמן הנסיעה צריך להיות בין 0 ל־180 דקות.";
      return;
    }
    if (serverCatalog) {
      serverCatalog.forEach(function (row) {
        if (row.id === "beard" && row.minutes >= 10 && row.minutes <= 180) {
          beardMinutes = Number(row.minutes);
        }
        if (current.services[row.id] && row.minutes >= 10 && row.minutes <= 180 && row.id === "beard") {
          current.services[row.id].minutes = Number(row.minutes);
        }
      });
    }
    if (current.services["mens-haircut"]) {
      current.services["mens-haircut"].minutes = cut;
    }
    if (current.services["kids-haircut"]) {
      current.services["kids-haircut"].minutes = cut;
    }
    if (current.services.beard) {
      current.services.beard.minutes = beardMinutes;
    }
    each(event.target.querySelectorAll("[data-service]"), function (input) {
      var id = input.getAttribute("data-service");
      var value = Number(input.value);
      if (!current.services[id] || input.getAttribute("data-field") !== "price") {
        return;
      }
      if (input.value === "" || value < 0 || value > 9999 || value !== Math.round(value)) {
        invalid = true;
        return;
      }
      current.services[id].priceIls = value;
    });
    if (invalid) {
      message.textContent = "כל מחיר צריך להיות מספר שלם בין 0 ל־9999.";
      return;
    }
    if (serverMode && !serverCatalog) {
      message.textContent = "לא ניתן לשמור לפני שהמחירים נטענו מהשרת.";
      return;
    }
    if (serverMode) {
      var auth = window.VIP_SUPABASE;
      var jobs = [];
      if (!auth || !auth.saveService || !auth.saveTravel) {
        message.textContent = "לא ניתן לשמור את המחירים בשרת.";
        return;
      }
      jobs.push(auth.saveTravel(travel));
      Object.keys(current.services).forEach(function (id) {
        var item = current.services[id];
        if (item.priceIls === null || item.priceIls === undefined) {
          return;
        }
        jobs.push(auth.saveService(id, item.priceIls, item.minutes));
      });
      Promise.all(jobs).then(function (results) {
        var failed = null;
        (results || []).forEach(function (result) {
          if (!failed && (!result || result.error)) {
            failed = result && result.error ? result.error : "לא ניתן לשמור את המחירים בשרת.";
          }
        });
        if (failed) {
          message.textContent = failed;
          return;
        }
        serverCatalog = Object.keys(current.services).map(function (id) {
          return {
            id: id,
            price_ils: current.services[id].priceIls,
            minutes: current.services[id].minutes,
            active: true
          };
        });
        if (window.VIP_SCHEDULE) {
          window.VIP_SCHEDULE.travelMinutes = travel;
        }
        if (window.VIP_DEMO && window.VIP_DEMO.applyServer) {
          window.VIP_DEMO.applyServer(serverCatalog);
        }
        try {
          localStorage.setItem(settingsKey, JSON.stringify({
            temporary: true,
            syncedWithCustomers: false,
            name: current.name,
            slotMinutes: current.slotMinutes,
            services: current.services
          }));
        } catch (error) {
          message.textContent = "הזמנים והמחירים נשמרו בשרת. העותק במכשיר לא נשמר.";
          return;
        }
        document.getElementById("biz-travel").removeAttribute("data-touched");
        message.textContent = "זמן התספורת, זמן הנסיעה והמחירים נשמרו.";
      }).catch(function () {
        message.textContent = "לא ניתן לשמור את המחירים בשרת.";
      });
      return;
    }
    try {
      localStorage.setItem(settingsKey, JSON.stringify({
        temporary: true,
        syncedWithCustomers: false,
        name: current.name,
        slotMinutes: current.slotMinutes,
        services: current.services
      }));
    } catch (error) {
      message.textContent = "לא ניתן לשמור במכשיר זה.";
      return;
    }
    message.textContent = "ההגדרות נשמרו במכשיר זה בלבד.";
  });
  each(document.querySelectorAll("[data-admin-panel]"), function (button) {
    button.addEventListener("click", function () {
      showPanel(button.getAttribute("data-admin-panel"));
    });
  });

  loadWeek();
  fillSettings();
  showPanel(String(window.location.hash || "").replace("#", ""));

  if (window.VIP_SUPABASE && window.VIP_SUPABASE.profile) {
    window.VIP_SUPABASE.profile().then(function (result) {
      if (result && result.profile && result.profile.role === "admin" && result.session) {
        openServerAdmin();
      }
    });
  }
})();
