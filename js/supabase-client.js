/*
 * Browser client only. The key is the publishable key, not the service_role key and not a password.
 * connected stays false until a real Supabase request has been confirmed.
 * Orders still live in local storage. This file does not read or delete them.
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
        detectSessionInUrl: true
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

  var api = {
    connected: false,
    url: url,
    client: null,
    lastCheck: null,
    createClient: createClient,
    checkConnection: checkConnection
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
