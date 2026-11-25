/* קריאות למסד הנתונים (Supabase). אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};

  var ERRORS = {
    DATE_NOT_AVAILABLE: "התאריך הזה כבר לא פנוי. בחרו בבקשה תאריך אחר.",
    ALREADY_REQUESTED: "כבר שלחתם בקשה לתאריך הזה. אורי יחזור אליכם בהקדם.",
    TOO_MANY_REQUESTS: "יש כרגע עומס. נסו שוב בעוד כמה דקות, או כתבו לי ישירות בוואטסאפ.",
    BAD_PASSWORD: "הסיסמה לא נכונה.",
    PASSWORD_TOO_SHORT: "הסיסמה החדשה צריכה להיות לפחות 8 תווים.",
    NAMES_REQUIRED: "כתבו בבקשה את השמות שלכם.",
    PHONE_INVALID: "מספר הטלפון לא נראה תקין.",
    NOT_FOUND: "לא מצאנו את הדף הזה. אפשר למלא שוב את השאלון, או לכתוב לי בוואטסאפ.",
    TERMS_REQUIRED: "כדי לשלוח את הבקשה צריך לאשר את התקנון.",
    LOCKED: "הבקשה כבר אושרה, ולכן אי אפשר לשנות אותה מכאן. כתבו לי בוואטסאפ ונסדר.",
    HOLD_EXPIRED: "התאריך כבר לא שמור לכם. אפשר לבחור ערב מחדש.",
    DATE_TAKEN: "התאריך הזה כבר תפוס על ידי זוג אחר.",
    NO_DATE: "לזוג הזה עדיין אין תאריך.",
    BAD_KEY: "מפתח היומן לא תקין.",
    STYLE_REQUIRED: "בחרו בבקשה את הסגנון שהכי מתאים לכם.",
    REVIEW_EMPTY: "כתבו בבקשה כמה מילים.",
    TOO_MANY_PHOTOS: "אפשר עד 30 תמונות לזוג.",
    EMAIL_INVALID: "כתבו בבקשה כתובת מייל תקינה, כדי שאוכל לשלוח לכם את הקבלה והתמונות."
  };

  function rpc(fn, args) {
    return fetch(C.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseKey },
      body: JSON.stringify(args || {})
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (!res.ok) {
          var code = (data && data.message) || "";
          var err = new Error(ERRORS[code] || "משהו השתבש. נסו שוב, או כתבו לי ישירות בוואטסאפ.");
          err.code = code;
          throw err;
        }
        return data;
      });
    });
  }

  // תאריך כטקסט YYYY-MM-DD לפי השעון המקומי
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }

  var DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  function prettyDate(s) {
    var d = parseIso(s);
    return "יום " + DAYS[d.getDay()] + ", " + d.getDate() + " ב" + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function waLink(number, text) {
    var n = String(number || "").replace(/\D/g, "");
    if (n.charAt(0) === "0") n = "972" + n.slice(1);
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(text || "");
  }

  function pkg(id) {
    return (C.packages || []).filter(function (p) { return p.id === id; })[0] || { id: id, name: id, price: "" };
  }

  function shortDate(s) { var d = parseIso(s); return "יום " + DAYS[d.getDay()] + ", " + d.getDate() + "." + (d.getMonth() + 1); }
  function money(n) { return "₪" + Number(n || 0).toLocaleString("he-IL"); }
  function deposit(p) { return Math.round((p.price || 0) * (C.depositPercent || 10) / 100); }
  function sunset(isoDay) {
    var L = C.sunLocation || (window.Sun && window.Sun.DEFAULT) || { lat: 32.08, lon: 34.78 };
    return window.Sun ? window.Sun.hhmm(window.Sun.sunsetMs(isoDay, L.lat, L.lon)) : "";
  }
  function holdText(ts) {
    var d = new Date(ts);
    var day = d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
    var t = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" });
    return day + " בשעה " + t;
  }
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
  function logo() { if (C.logo) document.documentElement.style.setProperty("--logo-url", "url('" + C.logo + "')"); }

  window.Booking = {
    rpc: rpc, iso: iso, parseIso: parseIso, prettyDate: prettyDate, shortDate: shortDate, waLink: waLink,
    pkg: pkg, money: money, deposit: deposit, sunset: sunset, holdText: holdText, esc: esc, logo: logo,
    MONTHS: MONTHS, DAYS: DAYS
  };
})();
