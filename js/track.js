/* מעקב פשוט לסטטיסטיקות בדף המנהל. אין צורך לערוך כאן.
   בלי עוגיות ובלי מידע אישי: נשמרים רק סוג האירוע, מאיפה הגיעו, ומזהה אקראי
   של הגלישה הנוכחית (נמחק כשסוגרים את הדפדפן). */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var SID = "turgi_sid", SRC = "turgi_src";

  function get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function sid() {
    var v = get(SID);
    if (!v) {
      v = "";
      var a = new Uint8Array(12);
      (window.crypto || window.msCrypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) v += ("0" + a[i].toString(16)).slice(-2);
      set(SID, v);
    }
    return v;
  }

  // מאיפה הגיעו: נקבע בכניסה הראשונה בגלישה ונשמר לכל השלבים שאחריה
  function detect() {
    var q = new URLSearchParams(location.search);
    var tag = (q.get("src") || q.get("utm_source") || "").toLowerCase();
    var ua = navigator.userAgent || "", ref = (document.referrer || "").toLowerCase();
    if (/^(ig|insta|instagram|bio)/.test(tag) || /Instagram/i.test(ua) || ref.indexOf("instagram.") > -1) return "instagram";
    if (/^(wa|whatsapp)/.test(tag) || ref.indexOf("whatsapp") > -1) return "whatsapp";
    if (/^(fb|facebook)/.test(tag) || /FBAN|FBAV|FB_IAB/.test(ua) || ref.indexOf("facebook.") > -1) return "facebook";
    if (/^tiktok/.test(tag) || /musical_ly|TikTok/i.test(ua) || ref.indexOf("tiktok.") > -1) return "tiktok";
    if (ref.indexOf("google.") > -1) return "google";
    if (ref && ref.indexOf(location.host) === -1) return "other";
    return tag ? "other" : "direct";
  }
  function source() {
    var v = get(SRC);
    if (!v) { v = detect(); set(SRC, v); }
    return v;
  }
  source();

  function track(event, token) {
    if (!C.supabaseUrl || /bot|crawl|spider|preview/i.test(navigator.userAgent || "")) return;
    try {
      fetch(C.supabaseUrl + "/rest/v1/rpc/track_event", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: C.supabaseKey },
        body: JSON.stringify({ p_event: event, p_source: source(), p_sid: sid(), p_token: token || null })
      }).catch(function () {});
    } catch (e) {}
  }

  window.Track = track;
  var auto = document.currentScript && document.currentScript.getAttribute("data-event");
  if (auto) track(auto);
})();
