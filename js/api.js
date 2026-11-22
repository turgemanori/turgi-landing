/* קריאות למסד הנתונים (Supabase). אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};

  var ERRORS = {
    DATE_NOT_AVAILABLE: "התאריך הזה כבר לא פנוי. בחרו בבקשה תאריך אחר.",
    ALREADY_REQUESTED: "כבר שלחתם בקשה לתאריך הזה. אורי יחזור אליכם בהקדם.",
    TOO_MANY_REQUESTS: "יש כרגע עומס בקשות. נסו שוב בעוד כמה דקות, או כתבו ישירות בוואטסאפ.",
    BAD_PASSWORD: "הסיסמה לא נכונה.",
    PASSWORD_TOO_SHORT: "הסיסמה החדשה צריכה להכיל לפחות 8 תווים."
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
          var err = new Error(ERRORS[code] || "משהו השתבש. נסו שוב, או כתבו ישירות בוואטסאפ.");
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

  window.Booking = { rpc: rpc, iso: iso, parseIso: parseIso, prettyDate: prettyDate, waLink: waLink, pkg: pkg, MONTHS: MONTHS };
})();
