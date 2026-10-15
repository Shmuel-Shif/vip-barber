/*
 * Browser client only. The key is the publishable key, not the service_role key and not a password.
 * connected stays false until a real Supabase request has been confirmed.
 * This file does not read or delete local orders.
 *
 * window.VIP_SUPABASE is assigned before any network call, so the object exists
 * as soon as this file has run, even if the CDN library is still loading.
 */
(function () {
  "use strict";

  var url = "https://riyiypsuwlnpsycobnpw.supabase.co";
  var publishableKey = "sb_publishable_96PIIh6eTsAh9KXV4aHhSA_Kqwb67V2";
  var client = null;

  function createClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library is not on the page.");
    }
    return window.supabase.createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage
      }
    });
  }

  function classify(error) {
    var message = error && error.message ? String(error.message) : "Unknown error";
    var code = error && (error.code || error.status) ? String(error.code || error.status) : "";
    var text = (code + " " + message).toLowerCase();
    var kind = "unknown";
    if (/failed to fetch|network|timeout|load failed|503|502|504/.test(text)) {
      kind = "connection";
    } else if (/quota|exceed|too many|rate limit|429|402/.test(text)) {
      kind = "quota";
    } else if (/permission|42501|401|403|jwt|row-level security|unauthorized/.test(text)) {
      kind = "permission";
    }
    return { kind: kind, message: message };
  }

  function ensureClient() {
    if (client) {
      return client;
    }
    try {
      client = createClient();
    } catch (error) {
      client = null;
    }
    api.client = client;
    return client;
  }

  function checkConnection() {
    if (!ensureClient()) {
      api.connected = false;
      api.lastCheck = classify({ message: "Supabase library is not on the page." });
      return Promise.resolve(api.lastCheck);
    }
    return client.from("services").select("id").limit(1).then(function (result) {
      if (result.error || !Array.isArray(result.data)) {
        api.connected = false;
        api.lastCheck = classify(result.error || { message: "Services did not return a list." });
      } else {
        api.connected = true;
        api.lastCheck = { kind: "ok", message: "" };
      }
      return api.lastCheck;
    }).catch(function (error) {
      api.connected = false;
      api.lastCheck = classify(error);
      return api.lastCheck;
    });
  }

  function whenReady() {
    if (ensureClient()) {
      return Promise.resolve(client);
    }
    return new Promise(function (resolve) {
      var waited = 0;
      var timer = window.setInterval(function () {
        waited += 50;
        if (ensureClient() || waited >= 8000) {
          window.clearInterval(timer);
          resolve(client);
        }
      }, 50);
    });
  }

  function messageFor(error) {
    var raw = error && error.message ? String(error.message) : (typeof error === "string" ? error : "");
    var text = raw.toLowerCase();
    if (!raw) {
      return "הפעולה נכשלה.";
    }
    if (text.indexOf("username taken") !== -1) {
      return "שם המשתמש תפוס. אפשר להתחבר.";
    }
    if (text.indexOf("invalid username") !== -1) {
      return "שם המשתמש צריך 3–24 תווים באנגלית, ספרות או _.";
    }
    if (text.indexOf("invalid login") !== -1 || text.indexOf("invalid credentials") !== -1) {
      return "האימייל או הסיסמה לא נכונים.";
    }
    if (text.indexOf("already registered") !== -1 || text.indexOf("already been registered") !== -1) {
      return "כבר יש חשבון עם האימייל הזה. אפשר להתחבר.";
    }
    if (text.indexOf("email not confirmed") !== -1) {
      return "צריך לאשר את האימייל לפני ההתחברות.";
    }
    if (text.indexOf("password") !== -1 && (text.indexOf("least") !== -1 || text.indexOf("short") !== -1 || text.indexOf("weak") !== -1)) {
      return "הסיסמה צריכה 6 תווים לפחות.";
    }
    if (text.indexOf("signups not allowed") !== -1 || (text.indexOf("signup") !== -1 && text.indexOf("disabled") !== -1)) {
      return "ההרשמה סגורה בשרת.";
    }
    if (text.indexOf("authentication required") !== -1) {
      return "צריך להתחבר לפני שליחת ההזמנה.";
    }
    if (text.indexOf("profile missing") !== -1) {
      return "החשבון עדיין לא מוכן. נסו להתחבר שוב.";
    }
    if (text.indexOf("time already taken") !== -1) {
      return "השעה הזו כבר תפוסה.";
    }
    if (text.indexOf("outside the open booking week") !== -1) {
      return "התאריך מחוץ לשבוע הפתוח להזמנה.";
    }
    if (text.indexOf("outside open hours") !== -1) {
      return "השעה מחוץ לשעות הפעילות.";
    }
    if (text.indexOf("overlaps a break") !== -1 || text.indexOf("blocked") !== -1) {
      return "השעה הזו חסומה.";
    }
    if (text === "closed") {
      return "היום סגור.";
    }
    if (text.indexOf("invalid appointment") !== -1) {
      return "פרטי ההזמנה לא תקינים.";
    }
    if (text.indexOf("invalid hours") !== -1 || text.indexOf("invalid break") !== -1 || text.indexOf("invalid block") !== -1) {
      return "השעות לא תקינות. צריך התחלה, סיום, והפסקות או חסימות בתוך הטווח.";
    }
    if (text.indexOf("invalid range") !== -1) {
      return "טווח התאריכים לזמינות לא תקין.";
    }
    if (text.indexOf("admin only") !== -1 || text.indexOf("row-level security") !== -1 || text.indexOf("permission denied") !== -1) {
      return "הפעולה הזו שמורה לחשבון האדמין.";
    }
    if (text.indexOf("failed to fetch") !== -1 || text.indexOf("network") !== -1 || text.indexOf("load failed") !== -1) {
      return "אין חיבור לשרת.";
    }
    if (text.indexOf("customer cannot change") !== -1) {
      return "אי אפשר לבטל החל מ־7 שעות לפני התור.";
    }
    if (text.indexOf("order not found") !== -1) {
      return "ההזמנה לא נמצאה בחשבון.";
    }
    if (text.indexOf("more than 7") !== -1 || text.indexOf("7 hours") !== -1) {
      return "אי אפשר לבטל החל מ־7 שעות לפני התור.";
    }
    return raw;
  }

  function normalizeUsername(value) {
    var name = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(name)) {
      return "";
    }
    return name;
  }

  function internalEmail(username) {
    return username + "@login.vip-barber.invalid";
  }

  // Auth email is not always the same as profiles.username.
  // zeevi770 is the admin profile, but that Auth user is still zeevi@...
  // The zeevi770@... address belongs to a different, non-admin user.
  function authEmailForUsername(username) {
    if (username === "zeevi770") {
      return internalEmail("zeevi");
    }
    return internalEmail(username);
  }

  function usernameAuthError(error) {
    var text = messageFor(error);
    if (text === "האימייל או הסיסמה לא נכונים.") {
      return "שם המשתמש או הסיסמה לא נכונים.";
    }
    if (text === "כבר יש חשבון עם האימייל הזה. אפשר להתחבר.") {
      return "שם המשתמש תפוס. אפשר להתחבר.";
    }
    return text;
  }

  function withClient(task) {
    return whenReady().then(function (ready) {
      if (!ready) {
        return { data: null, error: "אין חיבור." };
      }
      return task(ready);
    });
  }

  function currentSession() {
    return withClient(function (ready) {
      return ready.auth.getSession().then(function (result) {
        if (result.error) {
          return { session: null, error: messageFor(result.error) };
        }
        return { session: result.data && result.data.session ? result.data.session : null, error: "" };
      });
    });
  }

  function currentProfile() {
    return currentSession().then(function (result) {
      if (!result.session || !client) {
        return { profile: null, session: result.session, error: result.error };
      }
      return client.from("profiles").select("role, full_name, phone, username").eq("id", result.session.user.id).maybeSingle().then(function (profileResult) {
        if (profileResult.error) {
          return { profile: null, session: result.session, error: messageFor(profileResult.error) };
        }
        return { profile: profileResult.data, session: result.session, error: "" };
      });
    });
  }

  function mapOrder(row) {
    var time = row && row.appointment_time ? String(row.appointment_time) : "";
    if (time.length >= 5) {
      time = time.slice(0, 5);
    }
    return {
      id: row.id,
      customerId: row.customer_id || "",
      server: true,
      status: row.status || "pending",
      adults: row.adults || 0,
      children: row.children || 0,
      beards: row.beards || 0,
      vip: 0,
      date: row.appointment_date || "",
      time: time,
      photo: "",
      customer: {
        fullName: row.full_name || "",
        phone: row.phone || "",
        city: row.city || "",
        street: row.street || "",
        houseNumber: row.house_number || "",
        entrance: row.entrance || "",
        floor: row.floor || "",
        apartment: row.apartment || "",
        entryCode: row.entry_code || "",
        notes: row.notes || "",
        payment: row.payment || ""
      }
    };
  }

  var api = {
    connected: false,
    url: url,
    client: null,
    lastCheck: null,
    createClient: createClient,
    checkConnection: checkConnection,
    whenReady: whenReady,
    messageFor: messageFor,
    session: currentSession,
    profile: currentProfile,
    signUp: function (email, password) {
      return withClient(function (ready) {
        return ready.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        }).then(function (result) {
          if (result.error) {
            return { session: null, needsConfirm: false, error: messageFor(result.error) };
          }
          var session = result.data && result.data.session ? result.data.session : null;
          return { session: session, needsConfirm: !session, error: "" };
        });
      });
    },
    signIn: function (email, password) {
      return withClient(function (ready) {
        return ready.auth.signInWithPassword({
          email: email,
          password: password
        }).then(function (result) {
          if (result.error) {
            return { session: null, error: messageFor(result.error) };
          }
          return { session: result.data && result.data.session ? result.data.session : null, error: "" };
        });
      });
    },
    signUpWithUsername: function (username, password) {
      var name = normalizeUsername(username);
      if (!name) {
        return Promise.resolve({ session: null, needsConfirm: false, error: "שם המשתמש צריך 3–24 תווים באנגלית, ספרות או _." });
      }
      return withClient(function (ready) {
        return ready.auth.signUp({
          email: internalEmail(name),
          password: password,
          options: {
            data: { username: name },
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        }).then(function (result) {
          if (result.error) {
            return { session: null, needsConfirm: false, error: usernameAuthError(result.error) };
          }
          var session = result.data && result.data.session ? result.data.session : null;
          return { session: session, needsConfirm: !session, error: "" };
        });
      });
    },
    signInWithUsername: function (username, password) {
      var name = normalizeUsername(username);
      if (!name) {
        return Promise.resolve({ session: null, error: "שם המשתמש צריך 3–24 תווים באנגלית, ספרות או _." });
      }
      return withClient(function (ready) {
        return ready.auth.signInWithPassword({
          email: authEmailForUsername(name),
          password: password
        }).then(function (result) {
          if (result.error) {
            return { session: null, error: usernameAuthError(result.error) };
          }
          return { session: result.data && result.data.session ? result.data.session : null, error: "" };
        });
      });
    },
    signOut: function () {
      return withClient(function (ready) {
        return ready.auth.signOut().then(function () {
          return true;
        });
      });
    },
    watchAuth: function (handler) {
      return withClient(function (ready) {
        var watched = ready.auth.onAuthStateChange(function (event, session) {
          handler(event, session || null);
        });
        return watched;
      });
    },
    requestAppointment: function (fields) {
      return withClient(function (ready) {
        var clock = String(fields.time || "");
        if (clock.length === 5) {
          clock = clock + ":00";
        }
        return ready.rpc("request_appointment", {
          p_adults: fields.adults,
          p_children: fields.children,
          p_beards: fields.beards,
          p_date: fields.date,
          p_time: clock,
          p_full_name: fields.fullName,
          p_phone: fields.phone,
          p_city: fields.city || "",
          p_street: fields.street || "",
          p_house_number: fields.houseNumber || "",
          p_entrance: fields.entrance || "",
          p_floor: fields.floor || "",
          p_apartment: fields.apartment || "",
          p_entry_code: fields.entryCode || "",
          p_notes: fields.notes || "",
          p_payment: fields.payment
        }).then(function (result) {
          if (result.error) {
            return { id: "", error: messageFor(result.error) };
          }
          return { id: result.data || "", error: "" };
        });
      });
    },
    fetchOrders: function () {
      return withClient(function (ready) {
        return ready.from("orders").select("id, customer_id, status, adults, children, beards, appointment_date, appointment_time, full_name, phone, city, street, house_number, entrance, floor, apartment, entry_code, notes, payment").order("created_at", { ascending: false }).then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return {
            rows: (result.data || []).map(mapOrder),
            error: ""
          };
        });
      });
    },
    orderAction: function (name, id) {
      return withClient(function (ready) {
        return ready.rpc(name, { p_id: id }).then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          return { error: "" };
        });
      });
    },
    fetchCatalog: function () {
      return withClient(function (ready) {
        return ready.from("services").select("id, name, price_ils, minutes, addon, active").then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return { rows: result.data || [], error: "" };
        });
      });
    },
    fetchSchedule: function () {
      return withClient(function (ready) {
        return Promise.all([
          ready.from("weekly_hours").select("weekday, status, start_time, end_time, breaks, blocked").order("weekday"),
          ready.from("week_overrides").select("week_start, weekday, status, start_time, end_time, breaks, blocked"),
          ready.from("date_exceptions").select("service_date, status, start_time, end_time, breaks, blocked"),
          ready.from("business_settings").select("travel_minutes").eq("id", true).maybeSingle()
        ]).then(function (results) {
          var index;
          for (index = 0; index < results.length; index += 1) {
            if (results[index].error) {
              return { schedule: null, error: messageFor(results[index].error) };
            }
          }
          return {
            schedule: {
              weekly: results[0].data || [],
              weeks: results[1].data || [],
              exceptions: results[2].data || [],
              travelMinutes: results[3].data ? results[3].data.travel_minutes : null
            },
            error: ""
          };
        });
      });
    },
    saveTravel: function (minutes) {
      return withClient(function (ready) {
        return ready.from("business_settings").update({
          travel_minutes: minutes
        }).eq("id", true).select("travel_minutes").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || !result.data.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return { error: "" };
        });
      });
    },
    saveService: function (id, price, minutes) {
      return withClient(function (ready) {
        return ready.from("services").update({
          price_ils: price,
          minutes: minutes
        }).eq("id", id).select("id").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || !result.data.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return { error: "" };
        });
      });
    },
    saveWeeklyHours: function (rows) {
      return withClient(function (ready) {
        return ready.from("weekly_hours").upsert(rows, { onConflict: "weekday" }).select("weekday").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || result.data.length !== rows.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return { error: "" };
        });
      });
    },
    saveWeekOverride: function (weekStart, weekEnd, rows) {
      return withClient(function (ready) {
        return ready.from("week_overrides").upsert(rows, { onConflict: "week_start,weekday" }).select("weekday").then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          if (!result.data || result.data.length !== rows.length) {
            return { error: "הפעולה הזו שמורה לחשבון האדמין." };
          }
          return ready.from("date_exceptions").delete().gte("service_date", weekStart).lte("service_date", weekEnd).then(function (cleared) {
            if (cleared.error) {
              return { error: messageFor(cleared.error) };
            }
            return { error: "" };
          });
        });
      });
    },
    clearWeekOverride: function (weekStart, weekEnd) {
      return withClient(function (ready) {
        return ready.from("week_overrides").delete().eq("week_start", weekStart).then(function (result) {
          if (result.error) {
            return { error: messageFor(result.error) };
          }
          return ready.from("date_exceptions").delete().gte("service_date", weekStart).lte("service_date", weekEnd).then(function (cleared) {
            if (cleared.error) {
              return { error: messageFor(cleared.error) };
            }
            return { error: "" };
          });
        });
      });
    },
    fetchBusy: function (from, to) {
      return withClient(function (ready) {
        return ready.rpc("list_busy_spans", { p_from: from, p_to: to }).then(function (result) {
          if (result.error) {
            return { rows: [], error: messageFor(result.error) };
          }
          return { rows: result.data || [], error: "" };
        });
      });
    }
  };
  window.VIP_SUPABASE = api;

  function startCheck() {
    checkConnection();
  }

  if (window.supabase && typeof window.supabase.createClient === "function") {
    startCheck();
  } else {
    var libraryScript = document.currentScript && document.currentScript.previousElementSibling;
    if (libraryScript && libraryScript.tagName === "SCRIPT") {
      libraryScript.addEventListener("load", startCheck);
      libraryScript.addEventListener("error", startCheck);
    } else {
      startCheck();
    }
  }
})();
