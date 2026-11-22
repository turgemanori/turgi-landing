/* חישוב שעת השקיעה (נוסחת "משוואת הזריחה"). עובד בדפדפן ובשרת. אין צורך לערוך כאן. */
(function (root) {
  "use strict";
  var RAD = Math.PI / 180;

  // מחזיר את רגע השקיעה (מילישניות UTC) ליום YYYY-MM-DD במיקום נתון
  function sunsetMs(isoDay, lat, lon) {
    var p = String(isoDay).split("-");
    var jd = Date.UTC(+p[0], +p[1] - 1, +p[2], 12) / 86400000 + 2440587.5;
    var n = Math.round(jd - 2451545.0 + 0.0008);
    var jStar = n - lon / 360;
    var M = (357.5291 + 0.98560028 * jStar) % 360;
    var C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    var L = (M + C + 180 + 102.9372) % 360;
    var jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    var sinD = Math.sin(L * RAD) * Math.sin(23.4397 * RAD);
    var cosD = Math.cos(Math.asin(sinD));
    var cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinD) / (Math.cos(lat * RAD) * cosD);
    var w = Math.acos(Math.max(-1, Math.min(1, cosW))) / RAD;
    return (jTransit + w / 360 - 2440587.5) * 86400000;
  }

  // "16:42" בשעון ישראל
  function hhmm(ms) {
    return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" });
  }

  var api = { sunsetMs: sunsetMs, hhmm: hhmm, DEFAULT: { lat: 32.08, lon: 34.78 } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Sun = api;
})(this);
