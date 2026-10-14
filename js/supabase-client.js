/*
 * Not loaded by any page. The booking screens and the admin screens stay on local storage.
 * connected stays false until a later phase attaches this file to the site.
 * The key below is the publishable browser key. It is not the service_role key and not a password.
 */
(function () {
  "use strict";

  var url = "https://riyiypsuwlnpsycobnpw.supabase.co";
  var publishableKey = "sb_publishable_96PIIh6eTsAh9KXV4aHhSA_Kqwb67V2";

  window.VIP_SUPABASE = {
    connected: false,
    url: url,
    createClient: function () {
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
  };
})();
