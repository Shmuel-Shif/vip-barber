(function () {
  "use strict";

  var auth = window.VIP_SUPABASE;
  var status = document.getElementById("stats-status");
  var signedOut = document.getElementById("stats-signed-out");
  var main = document.getElementById("stats-main");
  var note = document.getElementById("stats-note");
  if (!auth || !status || !main || !auth.myProfile || !auth.myVisitStats) {
    return;
  }

  var loadGeneration = 0;

  function say(node, text) {
    if (node) {
      node.textContent = text || "";
    }
  }

  // Signed-out visitors would get zeros from my_visit_stats, so sign-in is checked first.
  function load() {
    var generation = ++loadGeneration;
    say(status, "טוען את הנתונים…");
    auth.myProfile().then(function (result) {
      if (generation !== loadGeneration) {
        return null;
      }
      if (!result || !result.signedIn) {
        main.hidden = true;
        signedOut.hidden = false;
        say(status, result && result.error ? result.error : "");
        return null;
      }
      signedOut.hidden = true;
      return auth.myVisitStats();
    }).then(function (result) {
      if (!result || generation !== loadGeneration) {
        return;
      }
      var stats = result.stats;
      if (!stats) {
        main.hidden = true;
        say(status, result.unavailable ? "ההיסטוריה תהיה זמינה בקרוב." : result.error || "לא הצלחנו לטעון את ההיסטוריה.");
        return;
      }
      say(document.getElementById("stat-mens"), String(stats.mensHaircuts));
      say(document.getElementById("stat-kids"), String(stats.kidsHaircuts));
      say(document.getElementById("stat-beards"), String(stats.beards));
      say(note, stats.visits ? "נספרים רק ביקורים שהושלמו." : "עדיין אין לך תורים שהושלמו.");
      say(status, "");
      main.hidden = false;
    }).catch(function () {
      if (generation === loadGeneration) {
        say(status, "לא הצלחנו לטעון את ההיסטוריה. נסו שוב בעוד רגע.");
      }
    });
  }

  document.getElementById("stats-login").addEventListener("click", function () {
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
