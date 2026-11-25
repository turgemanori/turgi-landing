/* קובץ יומן לזוג (ICS) עם הערב שלהם: נפתח ישירות ביומן של אפל, אאוטלוק ואנדרואיד.
   כתובת: /api/event?t=<הקוד של הדף האישי> */
"use strict";
const Sun = require("../js/sun.js");

// אותם ערכים כמו ב-js/config.js (המפתח ציבורי בכוונה)
const SUPABASE_URL = "https://xbtibqgluyzasrtmotjk.supabase.co";
const SUPABASE_KEY = "sb_publishable_1Ao_qT8WnBrolvISQpC1KA_-RvU5qKU";
const SITE = "https://turgi-landing.vercel.app";
const PLACE = { lat: 32.08, lon: 34.78 };
const OWNER = "אורי תורג׳מן";

function esc(t) {
  return String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
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

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://x");
  const token = (url.searchParams.get("t") || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  let l;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/lead_get", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ p_token: token })
    });
    if (!r.ok) { res.statusCode = 404; res.end("Not found"); return; }
    l = await r.json();
  } catch (e) { res.statusCode = 502; res.end("Unavailable"); return; }
  if (!l || !l.day) { res.statusCode = 404; res.end("No date yet"); return; }

  const set = Sun.sunsetMs(l.day, PLACE.lat, PLACE.lon);
  const where = l.location || l.pref_location || "";
  const page = SITE + "/for/" + token, guide = SITE + "/guide?t=" + token;
  const desc = [
    "הבוק הזוגי שלנו בשקיעה, עם " + OWNER + ".",
    "שקיעה: " + Sun.hhmm(set) + ". את שעת המפגש המדויקת אורי יאשר איתנו בוואטסאפ כמה ימים לפני.",
    l.pref_style ? "הסגנון שבחרנו: " + l.pref_style : "",
    where ? "המקום: " + where : "",
    "",
    "הדף שלנו: " + page,
    "מדריך ההכנה: " + guide
  ].filter(function (x, i) { return x !== "" || i === 4; }).join("\n");

  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turgeman Ori//Couple//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", "UID:couple-" + token + "@turgi", "DTSTAMP:" + utc(Date.now()),
    "DTSTART:" + utc(set - 2 * 3600000), "DTEND:" + utc(set + 20 * 60000),
    "SUMMARY:" + esc("הבוק הזוגי שלנו בשקיעה 📷"),
    "DESCRIPTION:" + esc(desc), "URL:" + page
  ];
  if (where) L.push("LOCATION:" + esc(where));
  L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc("מחר הבוק הזוגי שלנו! שווה להציץ שוב במדריך ההכנה"), "TRIGGER:-PT24H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="boq-zugi.ics"');
  res.setHeader("Cache-Control", "no-store");
  res.end(L.map(fold).join("\r\n") + "\r\n");
};
