/* יומן מנוי לאפל (ICS). נבנה מחדש מהנתונים באתר בכל רענון.
   כתובת: /api/calendar?key=<המפתח הסודי מדף המנהל> */
"use strict";
const Sun = require("../js/sun.js");

// אותם ערכים כמו ב-js/config.js (המפתח ציבורי בכוונה)
const SUPABASE_URL = "https://xbtibqgluyzasrtmotjk.supabase.co";
const SUPABASE_KEY = "sb_publishable_1Ao_qT8WnBrolvISQpC1KA_-RvU5qKU";
const PLACE = { lat: 32.08, lon: 34.78 };
const PKG = { basic: { name: "חבילה קלאסית", price: 1200 }, premium: { name: "חבילת פרימיום", price: 1500 } };
const DEPOSIT = 0.1;
const STATUS = { pending: "ממתין לאישור", awaiting_deposit: "מחכה למקדמה", booked: "שמור", shot: "צולם", delivered: "נמסר" };

function esc(t) {
  return String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
// קיפול שורות ל-75 בתים כנדרש בתקן, בלי לשבור תו עברי באמצע
function fold(line) {
  const out = []; let cur = ""; let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function utc(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function dateOnly(iso) { return iso.replace(/-/g, ""); }
function nextDay(iso) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ""); }
function money(n) { return "₪" + Number(n).toLocaleString("he-IL"); }

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const key = url.searchParams.get("key") || "";
  let feed;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/calendar_feed", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ p_key: key })
    });
    if (!r.ok) { res.statusCode = r.status === 400 ? 403 : 502; res.end("Calendar unavailable"); return; }
    feed = await r.json();
  } catch (e) { res.statusCode = 502; res.end("Calendar unavailable"); return; }

  const site = feed.site_url || "https://turgi-landing.vercel.app";
  const now = utc(Date.now());
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turgeman Ori//Booking//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:בוקים · אורי", "X-WR-TIMEZONE:Asia/Jerusalem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M"
  ];

  (feed.open || []).forEach(function (day) {
    const sunset = Sun.hhmm(Sun.sunsetMs(day, PLACE.lat, PLACE.lon));
    L.push("BEGIN:VEVENT", "UID:open-" + day + "@turgi", "DTSTAMP:" + now,
      "DTSTART;VALUE=DATE:" + dateOnly(day), "DTEND;VALUE=DATE:" + nextDay(day),
      "SUMMARY:" + esc("פנוי · בוק זוגי"), "DESCRIPTION:" + esc("ערב פנוי באתר · שקיעה " + sunset),
      "TRANSP:TRANSPARENT", "END:VEVENT");
  });

  (feed.items || []).forEach(function (l) {
    const setMs = Sun.sunsetMs(l.day, PLACE.lat, PLACE.lon);
    const start = setMs - 2 * 3600000, end = setMs + 20 * 60000;
    const base = PKG[l.package] || { name: l.package || "", price: 0 };
    const over = l["price_" + l.package];
    const p = { name: base.name, price: over != null ? over : base.price };
    const title = (l.status === "booked" ? "" : STATUS[l.status] + " · ") + l.names + " · " + p.name;
    const desc = [
      "סטטוס: " + (STATUS[l.status] || l.status),
      "שקיעה: " + Sun.hhmm(setMs),
      l.travel_minutes ? "יציאה מומלצת: " + Sun.hhmm(start - l.travel_minutes * 60000) + " (" + l.travel_minutes + " דק׳ נסיעה)" : "",
      "חבילה: " + p.name + " · " + money(p.price),
      "מקדמה: " + money(Math.round(p.price * DEPOSIT)) + (l.deposit_paid_at ? " שולמה" : " לא שולמה"),
      l.deposit_paid_at ? "יתרה ביום הצילום: " + money(p.price - Math.round(p.price * DEPOSIT)) : "",
      l.status === "awaiting_deposit" && l.hold_until ? "מוחזק עד: " + new Date(l.hold_until).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "",
      "",
      "טלפון: " + l.phone,
      l.email ? "מייל: " + l.email : "",
      l.instagram ? "אינסטגרם: @" + l.instagram : "",
      l.occasion ? "הסיבה: " + l.occasion : "",
      l.landscape ? "נוף: " + l.landscape.split(",").join(", ") : "",
      l.timing ? "מתי: " + l.timing : "",
      l.pref_style ? "סגנון שבחרו: " + l.pref_style : "",
      l.pref_location ? "מקום שביקשו: " + l.pref_location : "",
      l.admin_note ? "הערות: " + l.admin_note : "",
      "",
      "וואטסאפ: https://wa.me/" + String(l.phone).replace(/\D/g, "").replace(/^0/, "972"),
      "דף מנהל: " + site + "/admin"
    ].filter(function (x, i, a) { return x !== "" || (a[i - 1] !== "" && i > 0); }).join("\n");

    L.push("BEGIN:VEVENT", "UID:" + l.id + "@turgi", "DTSTAMP:" + now,
      "LAST-MODIFIED:" + utc(new Date(l.updated_at).getTime()),
      "DTSTART:" + utc(start), "DTEND:" + utc(end),
      "SUMMARY:" + esc(title), "DESCRIPTION:" + esc(desc), "URL:" + site + "/admin");
    if (l.location || l.pref_location) L.push("LOCATION:" + esc(l.location || l.pref_location));
    if (l.travel_minutes) L.push("X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT" + l.travel_minutes + "M",
      "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC");
    L.push("STATUS:" + (l.status === "pending" ? "TENTATIVE" : "CONFIRMED"), "END:VEVENT");
  });

  L.push("END:VCALENDAR");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="turgi-bookings.ics"');
  res.setHeader("Cache-Control", "no-cache, max-age=0");
  res.end(L.map(fold).join("\r\n") + "\r\n");
};
