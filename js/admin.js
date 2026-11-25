/* דף המנהל. אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking, esc = B.esc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "turgi_admin_pass";
  var pass = null, data = { dates: [], leads: [], settings: {} }, open = {}, original = {}, cal;
  var filter = "active", openCard = null;
  var today = B.iso(new Date());
  var helloUrl = location.origin + "/hello";

  B.logo();

  var STATUS = {
    lead: { t: "היכרות", c: "lead" },
    pending: { t: "ממתין לאישור", c: "pending" },
    awaiting_deposit: { t: "ממתין למקדמה", c: "hold" },
    booked: { t: "שמור", c: "booked" },
    shot: { t: "צולם", c: "shot" },
    delivered: { t: "נמסר", c: "done" },
    declined: { t: "נדחה", c: "off" },
    expired: { t: "פג תוקף", c: "off" }
  };
  // זוג חדש = עוד לא פתחת את הכרטיס שלו
  var trackingSince = null, statDays = 30;
  function isNew(l) { return "seen_at" in l && !l.seen_at; }
  // מילאו את השאלון אבל לא לחצו "שליחת הסיכום לאורי" (רק מאז שהמעקב התחיל)
  function noSend(l) {
    return l.status === "lead" && "summary_sent_at" in l && !l.summary_sent_at &&
      !!trackingSince && l.created_at >= trackingSince;
  }
  var FILTERS = [
    ["active", "פעילים", function (l) { return ["lead", "pending", "awaiting_deposit", "booked", "shot"].indexOf(l.status) > -1; }],
    ["new", "חדשים", isNew],
    ["nosend", "לא שלחו סיכום", noSend],
    ["lead", "היכרות", function (l) { return l.status === "lead"; }],
    ["pending", "ממתינים לאישור", function (l) { return l.status === "pending"; }],
    ["awaiting_deposit", "ממתינים למקדמה", function (l) { return l.status === "awaiting_deposit"; }],
    ["booked", "שמורים", function (l) { return l.status === "booked"; }],
    ["after", "צולמו ונמסרו", function (l) { return l.status === "shot" || l.status === "delivered"; }],
    ["off", "נדחו ופג תוקף", function (l) { return l.status === "declined" || l.status === "expired"; }]
  ];

  function store(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) {} }
  function stored() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function err(id, msg) { var e = $(id); e.textContent = msg || ""; e.hidden = !msg; }
  function copy(text, btn, label) {
    var done = function () { btn.textContent = "הועתק ✓"; setTimeout(function () { btn.textContent = label; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt("העתיקו:", text); });
    else window.prompt("העתיקו:", text);
  }

  // ----- כניסה -----
  function login(p) {
    $("loginBtn").disabled = true;
    return B.rpc("admin_leads", { p_pass: p }).then(function (res) {
      pass = p; store(p); data = res || data;
      $("loginForm").hidden = true; $("dash").hidden = false; $("logoutBtn").hidden = false;
      setup();
    }).catch(function (e) { store(null); err("loginError", e.message); })
      .then(function () { $("loginBtn").disabled = false; });
  }
  $("loginForm").addEventListener("submit", function (ev) { ev.preventDefault(); err("loginError"); login($("loginPass").value); });
  $("logoutBtn").addEventListener("click", function () { store(null); location.reload(); });
  var s = stored(); if (s) login(s);

  function reload() {
    err("dashError");
    return B.rpc("admin_leads", { p_pass: pass }).then(function (res) { data = res; setup(); })
      .catch(function (e) { err("dashError", e.message); });
  }
  $("refreshBtn").addEventListener("click", reload);

  // חבילה עם המחיר של הזוג הזה (מחיר מיוחד גובר על המחיר הרגיל)
  function lp(l, id) {
    var p = B.pkg(id), o = l["price_" + id];
    return { id: p.id, name: p.name, price: o != null ? o : p.price };
  }
  function pageUrl(l) { return location.origin + "/for/" + l.token; }
  function sunset(day) { return B.sunset(day); }
  function meetTime(day) {
    var Lc = C.sunLocation || window.Sun.DEFAULT;
    return window.Sun.hhmm(window.Sun.sunsetMs(day, Lc.lat, Lc.lon) - 2 * 3600000);
  }

  // ----- הכול -----
  function setup() {
    open = {}; original = {};
    (data.dates || []).forEach(function (d) { open[d] = true; original[d] = true; });
    if (!cal) {
      cal = new window.Calendar({
        el: $("adminCal"), month: new Date(), minMonth: new Date(), dayState: dayState,
        onPick: function (iso) { open[iso] = !open[iso]; if (!open[iso]) delete open[iso]; cal.render(); refreshSave(); $("savedNote").textContent = ""; }
      });
    } else cal.render();
    refreshSave();
    kpis(); upcoming(); filters(); list(); settings(); texts(); stats();
    $("shareWa").href = "https://wa.me/?text=" + encodeURIComponent("היי! כאן מכירים בדקה, ומקבלים דף אישי עם הערבים הפנויים לבוק זוגי בשקיעה\n" + helloUrl);
    if (location.hash === "#upcoming") setTimeout(function () { $("upcoming").scrollIntoView({ behavior: "smooth" }); }, 200);
  }
  // ----- טקסטים בדף הנחיתה -----
  // הנוסח המקורי נקרא מ-index.html (כל אלמנט עם data-t), והשינויים נשמרים בטבלה site_texts.
  var TX_GROUPS = {
    hero: "פתיחה", experience: "החוויה הזוגית", gallery: "גלריה", about: "למה דווקא איתי",
    sessions: "למי זה מתאים", included: "מה מקבלים", voices: "המלצות", faq: "שאלות נפוצות",
    contact: "סגירה", footer: "פוטר"
  };
  var tx = null; // { fields: [{key, orig, label, el}], saved: {} }
  function txLabel(node) {
    var t = node.tagName.toLowerCase(), cls = node.className || "";
    if (/eyebrow/.test(cls)) return "שורה קטנה מעל הכותרת";
    if (t === "h1" || t === "h2" || (t === "span" && node.closest("h1")) || (t === "em" && node.closest("h1"))) return "כותרת";
    if (t === "summary") return "שאלה";
    if (t === "h3" || t === "dt" || t === "strong") return "כותרת משנה";
    if (t === "a") return /btn/.test(cls) ? "כפתור" : "קישור";
    if (node.closest("summary") || node.closest(".qa")) return "תשובה";
    return "טקסט";
  }
  function texts() {
    if (tx) return;
    tx = { fields: [], saved: {} };
    Promise.all([
      fetch("/?texts=" + Date.now()).then(function (r) { return r.text(); }),
      B.rpc("public_site_texts")
    ]).then(function (res) {
      var doc = new DOMParser().parseFromString(res[0], "text/html");
      tx.saved = res[1] || {};
      var groups = {}, order = [];
      doc.querySelectorAll("[data-t]").forEach(function (node) {
        var key = node.getAttribute("data-t"), g = key.split(".")[0];
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push({ key: key, orig: node.textContent.replace(/\s+/g, " ").trim(), label: txLabel(node) });
      });
      var box = $("txGroups"); box.innerHTML = "";
      order.forEach(function (g) {
        var det = document.createElement("details"); det.className = "tx-group";
        var changed = groups[g].filter(function (f) { return tx.saved[f.key]; }).length;
        det.innerHTML = "<summary><span>" + esc(TX_GROUPS[g] || g) + "</span><em>" + groups[g].length + " טקסטים" + (changed ? " · " + changed + " שונו" : "") + "</em></summary>";
        groups[g].forEach(function (f) {
          var wrap = document.createElement("label"); wrap.className = "field tx-field";
          var cur = tx.saved[f.key] || f.orig;
          wrap.innerHTML = '<span class="tx-field__top"><span>' + esc(f.label) + '</span><button type="button" class="tx-reset">החזרה למקור</button></span>';
          var ta = document.createElement("textarea");
          ta.rows = Math.min(6, Math.max(1, Math.ceil(f.orig.length / 60)));
          ta.value = cur; ta.maxLength = 3000;
          wrap.appendChild(ta);
          f.el = ta;
          var reset = wrap.querySelector(".tx-reset");
          function mark() {
            var diff = ta.value.trim() && ta.value.trim() !== f.orig;
            wrap.classList.toggle("is-changed", !!diff); reset.hidden = !diff;
          }
          reset.addEventListener("click", function (ev) { ev.preventDefault(); ta.value = f.orig; mark(); txDirty(); });
          ta.addEventListener("input", function () { mark(); txDirty(); });
          mark();
          det.appendChild(wrap);
          tx.fields.push(f);
        });
        box.appendChild(det);
      });
    }).catch(function (e) {
      tx = null;
      $("txGroups").innerHTML = '<p class="form-error">לא הצלחנו לטעון את הטקסטים. ' + esc(e.message || "") + "</p>";
    });
  }
  function txDirty() { $("txSave").disabled = false; $("txNote").textContent = ""; }
  $("txSave").addEventListener("click", function () {
    if (!tx) return;
    var out = {};
    tx.fields.forEach(function (f) {
      var v = f.el.value.trim();
      out[f.key] = v && v !== f.orig ? v : null;
    });
    $("txSave").disabled = true; $("txNote").textContent = "שומר…";
    B.rpc("admin_site_texts_save", { p_pass: pass, p_texts: out }).then(function (saved) {
      tx.saved = saved || {};
      try { localStorage.removeItem("site_texts_v1"); } catch (e) {}
      $("txNote").textContent = "נשמר ✓ השינויים כבר באתר.";
    }).catch(function (e) { $("txSave").disabled = false; $("txNote").textContent = ""; err("dashError", e.message); });
  });

  $("copyLink").addEventListener("click", function () { copy(helloUrl, $("copyLink"), "העתקת קישור לשאלון"); });

  // ----- מה דורש טיפול -----
  function kpis() {
    var L = data.leads || [];
    var c = function (st) { return L.filter(function (l) { return l.status === st; }).length; };
    var fresh = L.filter(isNew).length;
    var items = [
      L.some(function (l) { return "seen_at" in l; }) ? ["new", fresh, "זוגות חדשים שעוד לא פתחת"] : ["lead", c("lead"), "היכרויות חדשות"],
      ["pending", c("pending"), "ממתינים לאישור שלך"],
      ["awaiting_deposit", c("awaiting_deposit"), "ממתינים למקדמה"],
      ["booked", c("booked"), "צילומים שמורים"]
    ];
    $("kpis").innerHTML = items.map(function (k) {
      return '<button type="button" class="kpi' + (k[1] && (k[0] === "pending" || k[0] === "new") ? " kpi--hot" : "") + '" data-f="' + k[0] + '"><strong>' + k[1] + "</strong><span>" + k[2] + "</span></button>";
    }).join("");
    $("kpis").querySelectorAll("[data-f]").forEach(function (b) {
      b.addEventListener("click", function () { filter = b.getAttribute("data-f"); filters(); list(); $("leadList").scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
  }

  // ----- לוח שנה -----
  function on(iso) { return (data.leads || []).filter(function (l) { return l.day === iso; }); }
  function dayState(iso) {
    var past = iso < today, ls = on(iso), cls = [];
    var booked = ls.some(function (l) { return ["booked", "shot", "delivered"].indexOf(l.status) > -1; });
    var hold = ls.some(function (l) { return l.status === "awaiting_deposit"; });
    var pending = ls.some(function (l) { return l.status === "pending"; });
    if (past) cls.push("is-past");
    if (booked) cls.push("is-booked"); else if (hold) cls.push("is-hold"); else if (open[iso]) cls.push("is-open");
    if (pending) cls.push("is-pending");
    var label = booked ? "שמור" : hold ? "מוחזק" : open[iso] ? "פתוח" : "סגור";
    return { disabled: past || booked || hold, cls: cls.join(" "), label: label };
  }
  function dirty() {
    return {
      add: Object.keys(open).filter(function (d) { return open[d] && !original[d]; }),
      remove: Object.keys(original).filter(function (d) { return !open[d]; })
    };
  }
  function refreshSave() {
    var d = dirty(), n = d.add.length + d.remove.length;
    $("saveDates").disabled = n === 0;
    $("saveDates").textContent = n ? "שמירה (" + n + " שינויים)" : "שמירה";
  }
  $("saveDates").addEventListener("click", function () {
    var d = dirty(); $("saveDates").disabled = true;
    B.rpc("admin_set_dates", { p_pass: pass, p_add: d.add, p_remove: d.remove })
      .then(function () { $("savedNote").textContent = "נשמר ✓"; return reload(); })
      .catch(function (e) { err("dashError", e.message); refreshSave(); });
  });

  // ----- הודעות מוכנות לוואטסאפ -----
  function first(l) { return l.names; }
  function messages(l) {
    var p = l.package ? lp(l, l.package) : null, url = pageUrl(l), out = [];
    var d = l.day ? B.prettyDate(l.day) : "";
    if (l.status === "lead") {
      out.push(["הודעת היכרות", "היי " + first(l) + ", כאן אורי\nתודה שמילאתם את השאלון, כיף להכיר!" +
        (l.occasion ? "\nראיתי שזה " + l.occasion + ", איזה יופי." : "") +
        "\nבדף האישי שלכם מחכים הערבים הפנויים והחבילות:\n" + url + "\nאשמח לענות על כל שאלה."]);
    }
    if (l.status === "pending") {
      out.push(["אישור + קישור למקדמה", "היי " + first(l) + "!\nאישרתי את " + d + ".\nהתאריך שמור לכם עד מחר ב-10:00 בבוקר. כדי לשמור אותו סופית, משלמים מקדמה של " +
        B.money(B.deposit(p)) + " כאן:\n" + url]);
      out.push(["הערב לא מתאפשר", "היי " + first(l) + ", תודה על הבקשה\nלצערי " + d + " לא מתאפשר הפעם. בדף שלכם אפשר לבחור ערב אחר:\n" + url]);
    }
    if (l.status === "awaiting_deposit") {
      out.push(["תזכורת מקדמה", "היי " + first(l) + ", רק מזכיר בעדינות\n" + d + " שמור לכם עד " + B.holdText(l.hold_until) +
        ". אחרי זה הוא חוזר להיות פנוי לזוגות אחרים.\nלתשלום המקדמה:\n" + url]);
    }
    if (l.status === "booked") {
      out.push(["פרטי מפגש", "היי " + first(l) + "! מתרגש לקראת " + d + "\n" +
        (l.location ? "נפגשים ב" + l.location + " " : "נפגשים ") + "בשעה " + meetTime(l.day) + " (השקיעה ב-" + sunset(l.day) + ").\n" +
        "המדריך עם כל מה שכדאי להכין: " + location.origin + "/guide"]);
      out.push(["מדריך הכנה", "היי " + first(l) + ", הכנתי לכם מדריך קטן לקראת הצילום: מה ללבוש, מה להביא ורשימת משימות\n" + location.origin + "/guide"]);
    }
    if (l.status === "shot") {
      out.push(["תודה על הערב", "היי " + first(l) + ", תודה על ערב מקסים\nאני כבר עובר על התמונות, ואעדכן כשהגלריה מוכנה."]);
    }
    if (l.status === "delivered") {
      out.push(["התמונות מוכנות", "היי " + first(l) + "! התמונות שלכם מוכנות\nשלחתי לכם את הגלריה למייל" + (l.email ? " (" + l.email + ")" : "") + ". מקווה שתאהבו כמו שאני אהבתי."]);
      out.push(["בקשת המלצה", "היי " + first(l) + ", אם נהניתם, אשמח מאוד לכמה מילים על החוויה זה עוזר לזוגות אחרים להכיר אותי."]);
    }
    if (l.status === "declined" || l.status === "expired") {
      out.push(["הזמנה לבחור שוב", "היי " + first(l) + ", עדיין יש ערבים פנויים, ואשמח לצלם אתכם\n" + url]);
    }
    return out;
  }

  // ----- צילומים קרובים -----
  function upcoming() {
    var lim = new Date(); lim.setDate(lim.getDate() + 10); var limIso = B.iso(lim);
    var L = (data.leads || []).filter(function (l) { return l.status === "booked" && l.day >= today && l.day <= limIso; })
      .sort(function (a, b) { return a.day < b.day ? -1 : 1; });
    var ul = $("upList"); ul.innerHTML = "";
    if (!L.length) { ul.innerHTML = '<li class="empty">אין צילומים שמורים ב-10 הימים הקרובים.</li>'; return; }
    L.forEach(function (l) {
      var li = document.createElement("li"); li.className = "bcard";
      li.innerHTML = '<div class="bcard__top"><span class="bcard__date">' + esc(B.prettyDate(l.day)) + '</span><span class="badge badge--booked">שמור</span></div>' +
        '<div class="bcard__meta"><strong>' + esc(l.names) + "</strong> · " + esc(B.pkg(l.package).name) + "</div>" +
        '<div class="bcard__meta">שקיעה ' + sunset(l.day) + " · מפגש " + meetTime(l.day) + (l.location ? " · " + esc(l.location) : " · <em>עוד אין מיקום</em>") + "</div>" +
        '<div class="wx" data-wx>בודק תחזית…</div><div class="admin__actions"></div>';
      ul.appendChild(li);
      weather(l).then(function (w) {
        li.querySelector("[data-wx]").innerHTML = w ? w.html : "התחזית תופיע עד 16 יום לפני הצילום.";
        var a = document.createElement("a"); a.className = "btn btn--primary btn--sm"; a.target = "_blank"; a.rel = "noopener";
        a.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-wa"/></svg>הודעת תיאום ומזג אוויר';
        a.href = B.waLink(l.phone, "היי " + first(l) + "! מתרגש לקראת " + B.prettyDate(l.day) + "\n" +
          (w ? "התחזית לשעת הצילום: " + w.text + ".\n" : "") +
          (l.location ? "נפגשים ב" + l.location + " " : "נפגשים ") + "בשעה " + meetTime(l.day) + ", והשקיעה ב-" + sunset(l.day) + ".\n" +
          "כל מה שכדאי להכין: " + location.origin + "/guide");
        li.querySelector(".admin__actions").appendChild(a);
      });
    });
  }

  var geoCache = {};
  function geocode(name) {
    var D = C.sunLocation || window.Sun.DEFAULT;
    if (!name) return Promise.resolve({ lat: D.lat, lon: D.lon, guess: true });
    if (geoCache[name]) return Promise.resolve(geoCache[name]);
    return fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=he&countryCode=IL&name=" + encodeURIComponent(name))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var g = j && j.results && j.results[0];
        geoCache[name] = g ? { lat: g.latitude, lon: g.longitude } : { lat: D.lat, lon: D.lon, guess: true };
        return geoCache[name];
      }).catch(function () { return { lat: D.lat, lon: D.lon, guess: true }; });
  }
  function weather(l) {
    var diff = (B.parseIso(l.day) - B.parseIso(today)) / 86400000;
    if (diff > 15) return Promise.resolve(null);
    return geocode(l.location).then(function (g) {
      return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + g.lat + "&longitude=" + g.lon +
        "&hourly=temperature_2m,precipitation_probability,cloud_cover,wind_speed_10m&timezone=Asia%2FJerusalem&start_date=" + l.day + "&end_date=" + l.day)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var h = j && j.hourly; if (!h || !h.time) return null;
          var hour = parseInt(sunset(l.day), 10) - 1, i = Math.max(0, Math.min(h.time.length - 1, hour));
          var t = Math.round(h.temperature_2m[i]), rain = h.precipitation_probability[i], cloud = h.cloud_cover[i], wind = Math.round(h.wind_speed_10m[i]);
          var warn = rain >= 40 ? " wx--warn" : "";
          var text = t + "°, סיכוי לגשם " + rain + "%, עננות " + cloud + "%, רוח " + wind + " קמ״ש";
          return {
            text: text,
            html: '<span class="wx__in' + warn + '">' + (rain >= 40 ? "גשם אפשרי: " : "") + esc(text) +
              (g.guess ? " <em>(לפי מרכז הארץ, כי לא זוהה מיקום)</em>" : "") + "</span>"
          };
        });
    }).catch(function () { return null; });
  }

  // ----- רשימת הזוגות -----
  function filters() {
    var box = $("filters"); box.innerHTML = "";
    FILTERS.forEach(function (f) {
      var n = (data.leads || []).filter(f[2]).length;
      var b = document.createElement("button"); b.type = "button";
      b.className = "tab" + (filter === f[0] ? " is-active" : ""); b.textContent = f[1] + " (" + n + ")";
      b.addEventListener("click", function () { filter = f[0]; filters(); list(); });
      box.appendChild(b);
    });
  }

  function list() {
    var f = FILTERS.filter(function (x) { return x[0] === filter; })[0] || FILTERS[0];
    var L = (data.leads || []).filter(f[2]);
    var ul = $("leadList"); ul.innerHTML = "";
    if (!L.length) { ul.innerHTML = '<li class="empty">אין כאן זוגות כרגע.</li>'; return; }
    L.forEach(function (l) { ul.appendChild(card(l)); });
  }

  function card(l) {
    var st = STATUS[l.status] || { t: l.status, c: "off" }, p = l.package ? lp(l, l.package) : null;
    var li = document.createElement("li"); li.className = "lcard" + (openCard === l.id ? " is-open" : "") + (isNew(l) ? " is-new" : "");
    var when = l.day ? B.shortDate(l.day) + " · שקיעה " + sunset(l.day) : "עוד לא בחרו ערב";
    li.innerHTML =
      '<button type="button" class="lcard__head" aria-expanded="' + (openCard === l.id) + '">' +
        '<span class="lcard__names">' + esc(l.names) + "</span>" +
        '<span class="lcard__badges">' +
          (isNew(l) ? '<span class="badge badge--new">חדש</span>' : "") +
          (noSend(l) ? '<span class="badge badge--nosend">לא שלחו סיכום</span>' : "") +
          '<span class="badge badge--' + st.c + '">' + st.t + "</span></span>" +
        '<span class="lcard__when">' + esc(when) + (p ? " · " + esc(p.name) : "") + "</span>" +
      "</button>" +
      '<div class="lcard__body"></div>';
    li.querySelector(".lcard__head").addEventListener("click", function () {
      openCard = openCard === l.id ? null : l.id;
      if (openCard && isNew(l)) {
        l.seen_at = new Date().toISOString();
        B.rpc("admin_lead_seen", { p_pass: pass, p_id: l.id }).catch(function () {});
        kpis(); filters();
      }
      list();
    });
    if (openCard === l.id) body(li.querySelector(".lcard__body"), l, p);
    return li;
  }

  function body(el, l, p) {
    var rows = [
      ["טלפון", '<bdi dir="ltr">' + esc(l.phone) + "</bdi>"],
      ["מייל", l.email ? '<bdi dir="ltr">' + esc(l.email) + "</bdi>" : "—"],
      ["אינסטגרם", l.instagram ? '<a class="link" target="_blank" rel="noopener" href="https://instagram.com/' + encodeURIComponent(l.instagram) + '">@' + esc(l.instagram) + "</a>" : "—"],
      ["הסיבה", esc(l.occasion || "—")],
      ["נוף", esc((l.landscape || "—").split(",").join(", "))],
      ["מתי", esc(l.timing || "—")],
      ["המלצה", esc(lp(l, l.recommended).name)]
    ];
    if (l.pref_style || l.pref_location) {
      rows.push(["הסגנון שבחרו", esc(l.pref_style || "—")]);
      rows.push(["מקום שביקשו", l.pref_location ? esc(l.pref_location) + (l.location ? "" : " <em>(נכנס ליומן עד שתקבע מיקום)</em>") : "—"]);
    }
    if (l.status === "pending" && "approval_sent_at" in l)
      rows.push(["בקשת אישור בוואטסאפ", l.approval_sent_at ? "שלחו לך ✓" : "עוד לא שלחו"]);
    if (p) rows.push(["מחיר / מקדמה", B.money(p.price) + " / " + B.money(B.deposit(p)) + (l.deposit_paid_at ? " ✓ " + esc(l.deposit_method || "") : "")]);
    if (l.hold_until && l.status === "awaiting_deposit") rows.push(["מוחזק עד", esc(B.holdText(l.hold_until))]);
    if (l.status === "lead" && "summary_sent_at" in l)
      rows.push(["סיכום בוואטסאפ", l.summary_sent_at ? "שלחו לך ✓" : noSend(l) ? "עוד לא שלחו. כדאי לכתוב להם" : "—"]);
    rows.push(["נכנס", new Date(l.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" })]);

    el.innerHTML =
      '<dl class="sum sum--tight">' + rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<div class="fields lfields">' +
        '<label class="field"><span>ערב</span><input type="date" data-k="day" value="' + (l.day || "") + '" /></label>' +
        '<label class="field"><span>חבילה</span><select data-k="package"><option value="">—</option>' +
          (C.packages || []).map(function (x) { return '<option value="' + x.id + '"' + (l.package === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>מיקום (יופיע ביומן)</span><input type="text" data-k="location" maxlength="160" value="' + esc(l.location || "") + '" placeholder="' + esc(l.pref_location || "למשל: חוף פלמחים") + '" /></label>' +
        '<label class="field"><span>זמן נסיעה בדקות</span><input type="number" data-k="travel_minutes" min="0" max="600" inputmode="numeric" value="' + (l.travel_minutes == null ? "" : l.travel_minutes) + '" /></label>' +
        '<label class="field field--wide"><span>הערות פרטיות (רק אתה רואה)</span><textarea data-k="admin_note" rows="2" maxlength="2000">' + esc(l.admin_note || "") + "</textarea></label>" +
      "</div>" +
      '<h3 class="lcard__sub">מה הזוג רואה בדף שלו</h3>' +
      '<div class="fields lfields">' +
        '<label class="field"><span>שמות</span><input type="text" data-k="names" maxlength="80" value="' + esc(l.names) + '" /></label>' +
        '<label class="field"><span>טלפון</span><input type="tel" data-k="phone" maxlength="20" dir="ltr" value="' + esc(l.phone) + '" /></label>' +
        '<label class="field field--wide"><span>כותרת אישית <em>(ריק = הכותרת הרגילה)</em></span><input type="text" data-k="page_title" maxlength="140" value="' + esc(l.page_title || "") + '" placeholder="' + esc(l.names) + ', הנה הערבים שפתוחים בשבילכם" /></label>' +
        '<label class="field field--wide"><span>הודעה אישית ממך בראש הדף</span><textarea data-k="page_note" rows="3" maxlength="1500" placeholder="למשל: היה כיף לדבר איתכם! שמרתי לכם במיוחד את ערבי הסוף שבוע.">' + esc(l.page_note || "") + "</textarea></label>" +
        '<label class="field"><span>החבילה שמומלצת להם</span><select data-k="recommended">' +
          (C.packages || []).map(function (x) { return '<option value="' + x.id + '"' + (l.recommended === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>" +
        (C.packages || []).map(function (x) {
          return '<label class="field"><span>מחיר מיוחד: ' + esc(x.name) + ' <em>(ריק = ' + B.money(x.price) + ")</em></span>" +
            '<input type="number" min="0" max="100000" inputmode="numeric" data-k="price_' + x.id + '" value="' + (l["price_" + x.id] == null ? "" : l["price_" + x.id]) + '" /></label>';
        }).join("") +
      "</div>" +
      '<div class="admin__actions" data-act></div>' +
      '<div class="lcard__wa"><p class="admin__hint">הודעות מוכנות בוואטסאפ</p><div class="admin__actions" data-wa></div></div>' +
      '<p class="lcard__link">הדף של הזוג: <a class="link" target="_blank" rel="noopener" href="' + pageUrl(l) + '">פתיחה</a> · <button type="button" class="link" data-copy>העתקה</button></p>';

    var act = el.querySelector("[data-act]");
    function btn(text, cls, fn) { var x = document.createElement("button"); x.type = "button"; x.className = "btn btn--sm " + cls; x.textContent = text; x.onclick = fn; act.appendChild(x); }
    btn("שמירת כל השינויים", "btn--primary", function () { save(el, l); });
    var s = l.status;
    if (s === "pending" || ((s === "declined" || s === "expired") && l.day)) btn("אישור (מחזיק עד מחר 10:00)", "btn--primary", function () { action(l, "approve"); });
    if (s === "awaiting_deposit") {
      btn("סימון מקדמה כשולמה", "btn--primary", function () { action(l, "mark_paid"); });
      btn("הארכה עד מחר 10:00", "btn--ghost", function () { action(l, "extend"); });
    }
    if (s === "booked") btn("סימון כצולם", "btn--primary", function () { action(l, "shot"); });
    if (s === "shot") btn("סימון כנמסר", "btn--primary", function () { action(l, "delivered"); });
    if (s === "pending" || s === "awaiting_deposit") btn("דחייה", "btn--ghost", function () { action(l, "decline"); });
    if (s === "booked") btn("ביטול השריון", "btn--ghost", function () { if (window.confirm("לבטל את השריון של " + l.names + "?")) action(l, "decline"); });
    if (s === "declined" || s === "expired") btn("החזרה להמתנה", "btn--ghost", function () { action(l, "restore"); });
    btn("מחיקה", "btn--ghost btn--danger", function () { if (window.confirm("למחוק את " + l.names + " לגמרי?")) action(l, "delete"); });

    var wa = el.querySelector("[data-wa]");
    messages(l).forEach(function (m) {
      var a = document.createElement("a"); a.className = "btn btn--ghost btn--sm"; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-wa"/></svg>' + esc(m[0]);
      a.href = B.waLink(l.phone, m[1]); wa.appendChild(a);
    });
    var free = document.createElement("a"); free.className = "btn btn--ghost btn--sm"; free.target = "_blank"; free.rel = "noopener";
    free.textContent = "שיחה ריקה"; free.href = B.waLink(l.phone, ""); wa.appendChild(free);
    el.querySelector("[data-copy]").addEventListener("click", function (e) { copy(pageUrl(l), e.target, "העתקה"); });
  }

  function save(el, l) {
    var d = {};
    el.querySelectorAll("[data-k]").forEach(function (f) { d[f.getAttribute("data-k")] = f.value; });
    B.rpc("admin_lead_save", { p_pass: pass, p_id: l.id, p_data: d }).then(reload).catch(function (e) { err("dashError", e.message); });
  }
  function action(l, a) {
    B.rpc("admin_lead_action", { p_pass: pass, p_id: l.id, p_action: a })
      .then(function () { if (a === "delete") openCard = null; return reload(); })
      .catch(function (e) { err("dashError", e.message); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  // ----- סטטיסטיקות -----
  var SRC = { instagram: "אינסטגרם", whatsapp: "וואטסאפ", facebook: "פייסבוק", tiktok: "טיקטוק", google: "גוגל", direct: "ישירות", other: "אחר" };
  document.querySelectorAll("#stRange [data-days]").forEach(function (b) {
    b.addEventListener("click", function () {
      statDays = +b.getAttribute("data-days");
      document.querySelectorAll("#stRange [data-days]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      stats();
    });
  });
  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : ""; }
  function stats() {
    var box = $("stBody");
    B.rpc("admin_stats", { p_pass: pass, p_days: statDays }).then(function (r) {
      var hadSince = !!trackingSince;
      trackingSince = r.tracking_since || null;
      if (!hadSince && trackingSince) { kpis(); filters(); list(); }
      var f = r.funnel || {}, ld = r.leads || {}, src = r.sources || [], daily = r.daily || [];
      var ig = (src.filter(function (x) { return x.source === "instagram"; })[0] || {}).n || 0;
      var srcTotal = src.reduce(function (a, x) { return a + x.n; }, 0);

      var kp = [
        [f.visit || 0, "כניסות לדף"],
        [ig, "הגיעו מאינסטגרם"],
        [ld.total || 0, "מילאו את השאלון"],
        [ld.summary || 0, "שלחו לך סיכום"]
      ];
      var steps = [
        ["נכנסו לדף הנחיתה", f.visit || 0],
        ["פתחו את השאלון", f.quiz_open || 0],
        ["התחילו למלא", f.quiz_start || 0],
        ["סיימו את השאלון", f.quiz_done || 0],
        ["שלחו לך את הסיכום בוואטסאפ", f.summary_sent || 0],
        ["ביקשו תאריך", ld.requested || 0, true],
        ["שילמו מקדמה", ld.paid || 0, true]
      ];
      var max = Math.max.apply(null, steps.map(function (x) { return x[1]; }).concat([1]));
      var html = '<div class="st-kpis">' + kp.map(function (k) {
        return '<div class="st-kpi"><strong>' + k[0] + "</strong><span>" + k[1] + "</span></div>";
      }).join("") + "</div>";

      html += '<h3 class="st-sub">המסלול של הזוגות</h3><ol class="funnel">' + steps.map(function (x, i) {
        var prev = i ? steps[i - 1][1] : 0;
        return '<li' + (x[2] ? ' class="is-db"' : "") + "><span>" + esc(x[0]) + '</span><span class="funnel__n">' + x[1] +
          (i && prev ? "<em>(" + pct(x[1], prev) + " מהשלב הקודם)</em>" : "") + "</span>" +
          '<span class="funnel__bar"><i style="width:' + (x[1] / max * 100) + '%"></i></span></li>';
      }).join("") + "</ol>";

      html += '<h3 class="st-sub">מאיפה הגיעו</h3>' + (src.length
        ? '<div class="st-src">' + src.map(function (x) {
            return "<span>" + esc(SRC[x.source] || x.source) + " <b>" + x.n + "</b> · " + pct(x.n, srcTotal) + "</span>";
          }).join("") + "</div>"
        : '<p class="admin__hint">עוד אין כניסות בתקופה הזאת.</p>');

      var dmax = Math.max.apply(null, daily.map(function (d) { return d.visits; }).concat([1]));
      html += '<h3 class="st-sub">כניסות לפי יום</h3><div class="st-days" role="img" aria-label="כניסות לדף לפי יום">' +
        daily.map(function (d) {
          var t = B.shortDate(d.day) + ": " + d.visits + " כניסות" + (d.leads ? ", " + d.leads + " שאלונים" : "");
          return '<i class="' + (d.leads ? "has-lead" : "") + '" style="height:' + (d.visits / dmax * 100) + '%" title="' + esc(t) + '"></i>';
        }).join("") + "</div>" +
        (daily.length ? '<div class="st-days-legend"><span>' + esc(B.shortDate(daily[0].day)) + "</span><span>היום</span></div>" : "") +
        '<p class="st-note">עמודה כהה = יום שבו מילאו שאלון.</p>';

      var ns = (data.leads || []).filter(noSend).length;
      if (ns) html += '<div class="st-alert"><span>' + ns + (ns === 1 ? " זוג מילא" : " זוגות מילאו") +
        ' את השאלון ולא שלחו לך את הסיכום. כדאי לכתוב להם בעצמך.</span><button type="button" class="btn btn--ghost btn--sm" data-nosend>להצגה</button></div>';

      if (trackingSince && new Date(trackingSince) > new Date(Date.now() - statDays * 86400000))
        html += '<p class="st-note">המעקב התחיל ב-' + esc(new Date(trackingSince).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })) +
          ", ולכן אין נתונים על כניסות לפני כן. ביקשו תאריך ושילמו מקדמה נספרים מכל השאלונים בתקופה.</p>";
      else html += '<p class="st-note">ביקשו תאריך ושילמו מקדמה נספרים מהשאלונים שהתקבלו בתקופה.</p>';

      box.innerHTML = html;
      var nb = box.querySelector("[data-nosend]");
      if (nb) nb.addEventListener("click", function () { filter = "nosend"; filters(); list(); $("leadList").scrollIntoView({ behavior: "smooth", block: "start" }); });
    }).catch(function () {
      box.innerHTML = '<p class="admin__hint">הסטטיסטיקות עוד לא זמינות. הן יופיעו אחרי שהעדכון יופעל במסד הנתונים.</p>';
    });
  }

  // ----- הגדרות: יומן, התראות, הודעת פתיחה -----
  function calUrl() { return location.host + "/api/calendar?key=" + encodeURIComponent(data.settings.cal_key || ""); }
  function settings() {
    var st = data.settings || {};
    $("calSub").href = "webcal://" + calUrl();
    $("ntOff").hidden = !!st.ntfy_topic; $("ntSetup").hidden = !st.ntfy_topic;
    $("ntTopic").textContent = st.ntfy_topic || "";
    $("greetText").value =
      "היי, כאן אורי\n" +
      "תודה שכתבתם לי! אני צלם בוקים זוגיים באור שקיעה, ואני כבר שמח להכיר.\n" +
      "קיבלתי את הפרטים שלכם, ואחזור אליכם אישית בהקדם.\n" +
      "בינתיים, אם עוד לא מילאתם, כאן מכירים בדקה ומקבלים דף אישי עם הערבים הפנויים:\n" + helloUrl;
  }
  $("calCopy").addEventListener("click", function () { copy("webcal://" + calUrl(), $("calCopy"), "העתקת הקישור"); });
  $("calRotate").addEventListener("click", function () {
    if (!window.confirm("להחליף את מפתח היומן? הקישור הישן יפסיק לעבוד, ותצטרך להירשם מחדש.")) return;
    saveSettings(data.settings.ntfy_topic, true).then(function () { $("calNote").textContent = "המפתח הוחלף. הוסיפו את היומן מחדש."; });
  });
  function saveSettings(topic, rotate) {
    return B.rpc("admin_settings_save", { p_pass: pass, p_ntfy_topic: topic || "", p_rotate_cal: !!rotate })
      .then(function (s2) { data.settings.cal_key = s2.cal_key; data.settings.ntfy_topic = s2.ntfy_topic; settings(); })
      .catch(function (e) { err("dashError", e.message); });
  }
  function randTopic() {
    var a = new Uint8Array(10); (window.crypto || window.msCrypto).getRandomValues(a);
    return "turgi-" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  $("ntOn").addEventListener("click", function () { saveSettings(randTopic(), false); });
  $("ntOffBtn").addEventListener("click", function () { if (window.confirm("לכבות את ההתראות?")) saveSettings("", false); });
  $("ntCopy").addEventListener("click", function () { copy(data.settings.ntfy_topic, $("ntCopy"), "העתקת שם הערוץ"); });
  $("ntTest").addEventListener("click", function () {
    B.rpc("admin_test_notify", { p_pass: pass }).then(function () { $("ntNote").textContent = "נשלחה התראת בדיקה. אמורה להגיע תוך כמה שניות."; })
      .catch(function (e) { $("ntNote").textContent = e.message; });
  });
  $("greetCopy").addEventListener("click", function () { copy($("greetText").value, $("greetCopy"), "העתקת הנוסח"); });

  // ----- סיסמה -----
  $("pwForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var np = $("newPass").value;
    B.rpc("admin_change_password", { p_pass: pass, p_new: np }).then(function () {
      pass = np; store(np); $("newPass").value = ""; $("pwNote").textContent = "הסיסמה עודכנה ✓";
    }).catch(function (e) { $("pwNote").textContent = e.message; });
  });
})();
