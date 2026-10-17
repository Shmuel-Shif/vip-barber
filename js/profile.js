(function () {
  "use strict";

  var auth = window.VIP_SUPABASE;
  var status = document.getElementById("profile-status");
  var signedOut = document.getElementById("profile-signed-out");
  var main = document.getElementById("profile-main");
  var form = document.getElementById("profile-form");
  if (!auth || !status || !main || !form || !auth.myProfile) {
    return;
  }

  var fieldset = document.getElementById("profile-fields");
  var editButton = document.getElementById("profile-edit");
  var saveButton = document.getElementById("profile-save");
  var cancelButton = document.getElementById("profile-cancel");
  var formStatus = document.getElementById("profile-form-status");
  var phoneError = document.getElementById("profile-phone-error");
  var statsNote = document.getElementById("profile-stats-note");
  var inputs = {
    firstName: document.getElementById("profile-first-name"),
    lastName: document.getElementById("profile-last-name"),
    phone: document.getElementById("profile-phone"),
    city: document.getElementById("profile-city"),
    street: document.getElementById("profile-street"),
    houseNumber: document.getElementById("profile-house-number"),
    entrance: document.getElementById("profile-entrance"),
    floor: document.getElementById("profile-floor"),
    apartment: document.getElementById("profile-apartment"),
    entryCode: document.getElementById("profile-entry-code")
  };
  var addressKeys = ["city", "street", "houseNumber", "entrance", "floor", "apartment", "entryCode"];
  var current = null;
  var busy = false;
  var loadGeneration = 0;

  function say(node, text) {
    if (node) {
      node.textContent = text || "";
    }
  }

  function fill(profile) {
    var first = profile.firstName;
    var last = profile.lastName;
    // Accounts that only have the older single name show it as the first name.
    if (!first && !last && profile.fullName) {
      first = profile.fullName;
    }
    inputs.firstName.value = first || "";
    inputs.lastName.value = last || "";
    inputs.phone.value = profile.phone || "";
    addressKeys.forEach(function (key) {
      inputs[key].value = profile.address[key] || "";
    });
  }

  function setEditing(on) {
    fieldset.disabled = !on;
    editButton.hidden = on;
    saveButton.hidden = !on;
    cancelButton.hidden = !on;
    if (on) {
      inputs.firstName.focus();
    }
  }

  function phoneOk(value) {
    var count = String(value || "").replace(/\D/g, "").length;
    return !String(value || "").trim() || (count >= 9 && count <= 15);
  }

  function readForm() {
    var address = {};
    addressKeys.forEach(function (key) {
      address[key] = inputs[key].value;
    });
    return {
      firstName: inputs.firstName.value,
      lastName: inputs.lastName.value,
      phone: inputs.phone.value,
      address: address
    };
  }

  function loadStats() {
    if (!auth.myVisitStats) {
      return;
    }
    auth.myVisitStats().then(function (result) {
      var stats = result && result.stats;
      if (!stats) {
        say(statsNote, result && result.unavailable ? "ההיסטוריה תהיה זמינה בקרוב." : (result && result.error) || "");
        return;
      }
      say(document.getElementById("stat-mens"), String(stats.mensHaircuts));
      say(document.getElementById("stat-kids"), String(stats.kidsHaircuts));
      say(document.getElementById("stat-beards"), String(stats.beards));
      say(statsNote, stats.visits ? "נספרים רק ביקורים שהושלמו." : "עדיין אין לך תורים שהושלמו.");
    });
  }

  function load() {
    var generation = ++loadGeneration;
    say(status, "טוען את הפרטים…");
    auth.myProfile().then(function (result) {
      if (generation !== loadGeneration) {
        return;
      }
      if (!result || !result.signedIn) {
        current = null;
        main.hidden = true;
        signedOut.hidden = false;
        say(status, result && result.error ? result.error : "");
        return;
      }
      signedOut.hidden = true;
      if (!result.profile) {
        main.hidden = true;
        say(status, result.error || "לא הצלחנו לטעון את הפרופיל.");
        return;
      }
      current = result.profile;
      main.hidden = false;
      fill(current);
      setEditing(false);
      if (!result.ready) {
        editButton.disabled = true;
        say(status, "עריכת הפרופיל תהיה זמינה בקרוב.");
      } else {
        editButton.disabled = false;
        var named = current.firstName || current.lastName || current.fullName;
        say(status, named ? "" : "כדאי להשלים את הפרטים, כדי שלא תצטרכו להקליד אותם בכל הזמנה.");
      }
      loadStats();
    }).catch(function () {
      if (generation === loadGeneration) {
        say(status, "לא הצלחנו לטעון את הפרופיל. נסו שוב בעוד רגע.");
      }
    });
  }

  editButton.addEventListener("click", function () {
    say(formStatus, "");
    setEditing(true);
  });

  cancelButton.addEventListener("click", function () {
    if (current) {
      fill(current);
    }
    say(phoneError, "");
    say(formStatus, "");
    setEditing(false);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy || fieldset.disabled) {
      return;
    }
    var values = readForm();
    if (!phoneOk(values.phone)) {
      say(phoneError, "יש להזין מספר טלפון תקין.");
      inputs.phone.setAttribute("aria-invalid", "true");
      inputs.phone.focus();
      return;
    }
    say(phoneError, "");
    inputs.phone.removeAttribute("aria-invalid");
    busy = true;
    saveButton.disabled = true;
    say(formStatus, "שומר…");
    auth.saveMyProfile(values).then(function (result) {
      busy = false;
      saveButton.disabled = false;
      if (!result || result.error || !result.profile) {
        say(formStatus, result && result.error ? result.error : "לא הצלחנו לשמור את הפרטים. נסו שוב בעוד רגע.");
        return;
      }
      current = result.profile;
      fill(current);
      setEditing(false);
      say(status, "");
      say(formStatus, "הפרטים נשמרו.");
      window.dispatchEvent(new Event("vip-profile-saved"));
    }).catch(function () {
      busy = false;
      saveButton.disabled = false;
      say(formStatus, "לא הצלחנו לשמור את הפרטים. נסו שוב בעוד רגע.");
    });
  });

  document.getElementById("profile-login").addEventListener("click", function () {
    if (window.VIP_AUTH && window.VIP_AUTH.open) {
      window.VIP_AUTH.open(load);
    }
  });

  if (auth.watchAuth) {
    auth.watchAuth(function (event) {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        load();
      }
    });
  }

  load();
})();
