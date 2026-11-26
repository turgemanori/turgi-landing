/* דף ההזמנה של הזוג (/for/<קוד>): בחירת ערב, אישור ומקדמה. "הדף האישי" הוא /guide?t=<קוד>. אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var $ = function (id) { return document.getElementById(id); };
  var token = decodeURIComponent((location.pathname.split("/for/")[1] || "").split("/")[0] || new URLSearchParams(location.search).get("t") || "");
  var pageUrl = location.origin + "/for/" + token;
  var L = null, sel = { day: null, pkg: null }, cal = null, avail = {}, timer = null;

  B.logo(); B.igLinks();
  var waGeneral = B.waLink(C.whatsappNumber, C.whatsappMessage);
  document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = waGeneral; });
  $("topWa").href = waGeneral;

  // ----- תקנון -----
  (C.terms || []).forEach(function (t) { var li = document.createElement("li"); li.textContent = t; $("termsList").appendChild(li); });
  document.querySelectorAll("[data-open]").forEach(function (b) {
    b.addEventListener("click", function () { openDlg($(b.getAttribute("data-open"))); });
  });
  function openDlg(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); }

  // ----- טעינה -----
  function load() {
    if (!token) return missing();
    return B.rpc("lead_get", { p_token: token }).then(function (res) { L = res; render(); })
      .catch(function (e) { if (e.code === "NOT_FOUND") missing(); else { $("loading").textContent = e.message; } });
  }
  function missing() { $("loading").hidden = true; $("missing").hidden = false; }

  function ctxWa(extra) {
    var t = "היי אורי, כאן " + L.names + "" + (extra ? "\n" + extra : "") + "\nדף ההזמנה שלנו: " + pageUrl;
    return B.waLink(C.whatsappNumber, t);
  }

  var VIEWS = ["vChoose", "vPrefs", "vPending", "vDeposit", "vBooked", "vAfter"];
  function view(id) { VIEWS.forEach(function (v) { $(v).hidden = v !== id; }); }

  function track(stage) {
    document.querySelectorAll("#track li").forEach(function (li, i) {
      li.className = i < stage ? "is-done" : i === stage ? "is-now" : "";
    });
  }

  function summary(el) {
    var p = L.package ? B.pkg(L.package) : null, rows = [];
    if (L.day) rows.push(["הערב", B.prettyDate(L.day) + " · מפגש משוער " + meetTime(L.day)]);
    if (L.location || L.pref_location) rows.push(["המקום", L.location || L.pref_location + " (ביקשתם)"]);
    if (L.pref_style) rows.push(["הסגנון", L.pref_style]);
    if (p) {
      rows.push(["החבילה", p.name]);
      rows.push(["מחיר", B.money(p.price)]);
      rows.push(["מקדמה", B.money(B.deposit(p)) + (L.deposit_paid_at ? " · שולמה ✓" : "")]);
      if (L.full_paid_at) rows.push(["תשלום מלא", "שולם ✓"]);
      else if (L.deposit_paid_at) rows.push(["יתרה לתשלום", B.money(p.price - B.deposit(p))]);
    }
    el.innerHTML = rows.map(function (r) { return "<div><dt>" + B.esc(r[0]) + "</dt><dd>" + B.esc(r[1]) + "</dd></div>"; }).join("");
  }

  var BASE = (C.packages || []).map(function (p) { return p.price; });
  function render() {
    $("loading").hidden = true; $("page").hidden = false;
    // מחיר מיוחד שאורי קבע לזוג הזה (אם יש)
    (C.packages || []).forEach(function (p, i) { var o = L["price_" + p.id]; p.price = o != null ? o : BASE[i]; });
    $("personal").hidden = !L.page_note;
    $("personalText").textContent = L.page_note || "";
    document.title = L.names + " | דף ההזמנה שלכם";
    document.querySelectorAll("[data-wa-ctx]").forEach(function (a) { a.href = ctxWa(""); });
    $("topWa").href = ctxWa("");
    document.querySelectorAll("[data-sum]").forEach(summary);
    if (timer) { clearInterval(timer); timer = null; }

    var s = L.status;
    if (s === "lead" || s === "declined" || s === "expired") {
      $("hello").textContent = L.names + ", הנה הערבים שפתוחים בשבילכם";
      $("lead").textContent = "בחרו חבילה וערב ושלחו לי, ואני אחזור אליכם לאישור.";
      track(1); view("vChoose"); choose();
      var note = s === "declined" ? "הערב שבחרתם לא מסתדר לי הפעם. בחרו ערב אחר, או שנמצא אחד יחד בוואטסאפ."
        : s === "expired" ? "התאריך שבחרתם כבר לא שמור לכם, כי המקדמה לא שולמה בזמן. אפשר לבחור שוב ערב פנוי." : "";
      $("chooseNote").textContent = note; $("chooseNote").hidden = !note;
    } else if (s === "pending" && (!L.prefs_at || editPrefs)) {
      $("hello").textContent = L.names + ", בחרתם ערב";
      $("lead").textContent = B.prettyDate(L.day);
      track(1); view("vPrefs"); prefs();
    } else if (s === "pending") {
      $("hello").textContent = L.names + ", כמעט סיימנו";
      $("lead").textContent = "";
      track(2); view("vPending"); pending();
    } else if (s === "awaiting_deposit") {
      $("hello").textContent = L.names + ", התאריך שמור לכם";
      $("lead").textContent = "נשאר רק צעד אחד: מקדמה קטנה, והערב שלכם.";
      track(3); view("vDeposit"); deposit();
    } else if (s === "booked") {
      $("hello").textContent = L.names + ", נתראה בצילום";
      $("lead").textContent = "";
      track(5); view("vBooked"); booked();
    } else {
      $("hello").textContent = L.names + ", תודה על ערב מקסים";
      $("lead").textContent = "";
      $("afterTitle").textContent = s === "delivered" ? "התמונות שלכם אצלכם" : "עכשיו אני עורך את התמונות שלכם";
      $("afterText").textContent = s === "delivered"
        ? "היה לי כיף גדול לצלם אתכם. אם בא לכם לכתוב כמה מילים על החוויה, אשמח מאוד."
        : "אני עובר על כל תמונה בקפידה. ברגע שהגלריה מוכנה, אשלח לכם אותה בוואטסאפ ובמייל.";
      track(5); view("vAfter"); after();
    }

    if (L.page_title) $("hello").textContent = L.page_title;

    var q = new URLSearchParams(location.search);
    if (q.get("welcome") === "1" && s === "lead") {
      welcome();
      history.replaceState(null, "", "/for/" + token);
    }
  }

  // ----- ברוכים הבאים: סיכום הפרטים שנקלטו -----
  // הסיכום כפסקה אחת, כמו סיפור של הערב שהם חולמים עליו
  var OCCASION = {
    "יום נישואין": "אנחנו רוצים לחגוג את יום הנישואין שלנו בערב אחד שכולו שלנו",
    "לפני חתונה": "החתונה שלנו מתקרבת, ולפני כל ההמולה אנחנו רוצים לעצור לערב אחד רק של שנינו",
    "הריון": "אנחנו מחכים לתינוק, ורוצים לשמור את התקופה הזאת לתמיד",
    "בלי סיבה מיוחדת": "בלי סיבה מיוחדת, פשוט בא לנו ערב זוגי אחד שכולו שלנו",
    "במתנה": "זה מתחיל במתנה, ואנחנו רוצים שזה יהיה ערב שלא נשכח"
  };
  var PLACE = { "ים": "מול הים", "שדות": "בשדות פתוחים", "מדבר": "במדבר", "עיר": "ברחובות העיר", "אצלנו בבית": "אצלנו בבית" };
  var TIMING = {
    "בחודש הקרוב": "נשמח שזה יקרה כבר בחודש הקרוב.",
    "בחודשים הקרובים": "נשמח שזה יקרה בחודשים הקרובים.",
    "אנחנו גמישים": "מבחינת תאריכים אנחנו גמישים."
  };
  function story() {
    var places = (L.landscape || "").split(",").map(function (x) { return PLACE[x.trim()]; }).filter(Boolean);
    var where = places.length === 0 ? ", ואת המקום עוד לא בחרנו, אז נשמח שתציע לנו פינה עם אור יפה."
      : ", " + (places.length > 1 ? places.slice(0, -1).join(", ") + " או " + places[places.length - 1] : places[0]) +
        ", באור רך של ערב.";
    var t = (OCCASION[L.occasion] || "אנחנו חולמים על בוק זוגי") + where;
    if (TIMING[L.timing]) t += " " + TIMING[L.timing];
    return t;
  }

  function welcome() {
    $("wTitle").textContent = L.names;
    var text = story(), ig = L.instagram || "";
    try { ig = ig || sessionStorage.getItem("turgi_ig_" + token) || ""; } catch (e) {}
    $("wStory").textContent = text;
    $("wWa").href = B.waLink(C.whatsappNumber,
      "היי אורי, כאן " + L.names + ". " + text + " מחכים לשמוע ממך." +
      (ig ? "\nהאינסטגרם שלנו: instagram.com/" + ig : "") +
      "\n\nדף ההזמנה שלנו: " + pageUrl);
    openDlg($("welcomeDlg"));
  }

  // אחרי ששלחו את הסיכום החלון נסגר, ומחכה להם בחירת הערב
  $("welcomeDlg").addEventListener("cancel", function (e) { e.preventDefault(); });
  $("wWa").addEventListener("click", function () {
    if (window.Track) window.Track("summary_sent", token);
    setTimeout(function () { $("welcomeDlg").close(); window.scrollTo({ top: 0 }); }, 500);
  });

  // ----- בחירת חבילה וערב -----
  function choose() {
    sel.pkg = sel.pkg || L.package || L.recommended || "basic";
    var box = $("pkgs"); box.innerHTML = "";
    (C.packages || []).forEach(function (p) {
      var rec = p.id === L.recommended;
      var lab = document.createElement("label");
      lab.className = "pkg" + (rec ? " pkg--rec" : "");
      lab.innerHTML =
        '<input type="radio" name="pkg" value="' + p.id + '"' + (sel.pkg === p.id ? " checked" : "") + " />" +
        (rec ? '<span class="pkg__rec">ההמלצה שלי בשבילכם</span>' : "") +
        '<span class="pkg__top"><span class="pkg__name"></span><span class="pkg__price"></span></span>' +
        '<ul class="pkg__list"></ul>' + (rec ? '<p class="pkg__why"></p>' : "");
      lab.querySelector(".pkg__name").textContent = p.name;
      lab.querySelector(".pkg__price").textContent = B.money(p.price);
      p.features.forEach(function (f) { var li = document.createElement("li"); li.textContent = f; lab.querySelector(".pkg__list").appendChild(li); });
      if (rec) lab.querySelector(".pkg__why").textContent = p.reason || "";
      lab.querySelector("input").addEventListener("change", function () { sel.pkg = p.id; sum(); });
      box.appendChild(lab);
    });

    avail = {}; (L.dates || []).forEach(function (d) { avail[d] = true; });
    if (L.day && avail[L.day] && !sel.day) sel.day = L.day;
    var firstDay = (L.dates || [])[0];
    $("noDates").hidden = !!firstDay;
    if (!cal) {
      cal = new window.Calendar({
        el: $("cal"),
        month: firstDay ? B.parseIso(firstDay) : new Date(), minMonth: new Date(),
        dayState: function (iso) {
          var ok = !!avail[iso];
          return { disabled: !ok, cls: (ok ? "is-open" : "is-closed") + (iso === sel.day ? " is-selected" : ""), label: ok ? "פנוי" : "לא פנוי" };
        },
        onPick: function (iso) { sel.day = iso; cal.render(); sum(); }
      });
    } else cal.render();
    sum();
  }

  function sum() {
    var p = B.pkg(sel.pkg), rows = [];
    $("picked").hidden = !sel.day;
    if (sel.day) $("picked").textContent = B.prettyDate(sel.day) + " · מפגש משוער " + meetTime(sel.day);
    rows.push(["הערב", sel.day ? B.prettyDate(sel.day) : "עוד לא נבחר"]);
    rows.push(["החבילה", p.name + " · " + B.money(p.price)]);
    rows.push(["מקדמה לשמירת התאריך", B.money(B.deposit(p)) + " (" + (C.depositPercent || 10) + "%)"]);
    $("sum").innerHTML = rows.map(function (r) { return "<div><dt>" + B.esc(r[0]) + "</dt><dd>" + B.esc(r[1]) + "</dd></div>"; }).join("");
  }

  $("sendBtn").addEventListener("click", function () {
    var e = $("chooseErr"), btn = $("sendBtn");
    var msg = !sel.day ? "בחרו בבקשה ערב מהלוח." : !$("terms").checked ? "כדי לשלוח את הבקשה צריך לאשר את התקנון." : "";
    e.textContent = msg; e.hidden = !msg; if (msg) return;
    btn.disabled = true; btn.textContent = "שולח…";
    B.rpc("lead_request", { p_token: token, p_day: sel.day, p_package: sel.pkg, p_terms: true })
      .then(load)
      .then(function () { window.scrollTo({ top: 0, behavior: "smooth" }); })
      .catch(function (er) { e.textContent = er.message; e.hidden = false; if (er.code === "DATE_NOT_AVAILABLE") { sel.day = null; load(); } })
      .then(function () { btn.disabled = false; btn.textContent = "בחרנו, ממשיכים"; });
  });

  // ----- העדפות: סגנון ומקום -----
  var editPrefs = false, style = null;
  function prefs() {
    style = style || L.pref_style || null;
    var box = $("styles"); box.innerHTML = "";
    (C.photoStyles || []).forEach(function (st) {
      var lab = document.createElement("label");
      lab.className = "pkg style";
      lab.innerHTML = '<input type="radio" name="style" /><span class="pkg__name"></span><span class="style__desc"></span>';
      lab.querySelector(".pkg__name").textContent = st.name;
      lab.querySelector(".style__desc").textContent = st.desc;
      var inp = lab.querySelector("input"); inp.value = st.name; inp.checked = style === st.name;
      inp.addEventListener("change", function () { style = st.name; $("prefsErr").hidden = true; });
      box.appendChild(lab);
    });
    if (!$("prefLoc").value) $("prefLoc").value = L.pref_location || "";
  }
  $("prefsBtn").addEventListener("click", function () {
    var e = $("prefsErr"), btn = $("prefsBtn");
    if (!style) { e.textContent = "בחרו בבקשה את הסגנון שהכי מתאים לכם."; e.hidden = false; return; }
    btn.disabled = true; btn.textContent = "שומר…";
    B.rpc("lead_prefs", { p_token: token, p_style: style, p_location: $("prefLoc").value.trim() })
      .then(function () { editPrefs = false; return load(); })
      .then(function () { window.scrollTo({ top: 0, behavior: "smooth" }); })
      .catch(function (er) { e.textContent = er.message; e.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "שמירה והמשך"; });
  });
  $("prefsEdit").addEventListener("click", function () { editPrefs = true; render(); });

  // ----- שליחה לאורי לאישור (בלי קישור לדף) -----
  function pending() {
    var p = B.pkg(L.package), sent = !!L.approval_sent_at;
    var t = "היי אורי, כאן " + L.names + ".\nבחרנו את " + B.prettyDate(L.day) + " ב" + p.name + "." +
      (L.pref_style ? "\nהסגנון שבחרנו: " + L.pref_style + "." : "") +
      (L.pref_location ? "\nמקום שנשמח לצלם בו: " + L.pref_location + "." : "") +
      "\nנשמח שתאשר לנו את התאריך 🙏";
    $("approvalWa").href = B.waLink(C.whatsappNumber, t);
    $("pendTitle").textContent = sent ? "הבקשה אצלי" : "שלחו לי את הבקשה לאישור";
    $("pendText").textContent = sent
      ? "אני עובר על הבקשה ואחזור אליכם בהקדם. אחרי שאאשר, אשלח לכם קישור למקדמה ששומרת את התאריך."
      : "לחיצה אחת, והבקשה אצלי בוואטסאפ. ברגע שאאשר, אשלח לכם קישור למקדמה ששומרת את התאריך.";
    $("approvalWa").lastChild.textContent = sent ? "שליחה שוב לאורי" : "שליחה לאורי לאישור";
    $("approvalWa").className = "btn " + (sent ? "btn--ghost" : "btn--primary");
  }
  $("approvalWa").addEventListener("click", function () {
    B.rpc("lead_mark", { p_token: token, p_what: "approval_sent" }).catch(function () {});
    setTimeout(function () { L.approval_sent_at = L.approval_sent_at || new Date().toISOString(); pending(); }, 600);
  });

  $("changeBtn").addEventListener("click", function () {
    sel.day = L.day; sel.pkg = L.package;
    L.status = "lead"; render();
    $("hello").textContent = L.names + ", מה תרצו לשנות?";
  });

  // ----- מקדמה -----
  function deposit() {
    var p = B.pkg(L.package);
    $("depAmt").textContent = B.money(B.deposit(p));
    if (!$("fEmail").value) $("fEmail").value = L.email || "";
    var until = new Date(L.hold_until).getTime();
    function tick() {
      var left = until - Date.now();
      if (left <= 0) { clearInterval(timer); load(); return; }
      var h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000);
      $("hold").innerHTML = "<strong>שמור לכם עד " + B.esc(B.holdText(L.hold_until)) + "</strong>" +
        "<span>נשארו " + h + " שעות ו-" + m + " דקות. אחרי זה התאריך חוזר להיות פנוי לזוגות אחרים.</span>";
    }
    tick(); timer = setInterval(tick, 30000);
    $("hText").textContent = "אישרתי את הבקשה שלכם ל" + B.prettyDate(L.day) + ". התאריך שמור לכם עד " +
      B.holdText(L.hold_until) + ", וכדי לסגור אותו סופית נשאר רק לשלם את המקדמה.";
    var seen = "turgi_hold_seen_" + token + "_" + L.hold_until;
    var was = false; try { was = !!sessionStorage.getItem(seen); sessionStorage.setItem(seen, "1"); } catch (e) {}
    if (!was) openDlg($("holdDlg"));
  }
  var method = null;
  document.querySelectorAll("[data-pay]").forEach(function (b) {
    b.addEventListener("click", function () {
      var em = $("fEmail").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        $("payErr").textContent = "כתבו בבקשה מייל, כדי שאוכל לשלוח לכם את הקבלה ואת התמונות."; $("payErr").hidden = false;
        $("fEmail").focus(); return;
      }
      $("payErr").hidden = true;
      if (em.toLowerCase() !== (L.email || "")) {
        B.rpc("lead_email", { p_token: token, p_email: em }).then(function () { L.email = em.toLowerCase(); })
          .catch(function (er) { $("payErr").textContent = er.message; $("payErr").hidden = false; $("payDemo").hidden = true; });
      }
      method = b.getAttribute("data-pay");
      $("payName").textContent = method === "bit" ? "Bit" : "אשראי";
      $("payDemo").hidden = false;
    });
  });
  $("payCancel").addEventListener("click", function () { $("payDemo").hidden = true; });
  $("payConfirm").addEventListener("click", function () {
    var b = $("payConfirm"); b.disabled = true;
    B.rpc("lead_pay_demo", { p_token: token, p_method: method })
      .then(function () { $("payDemo").hidden = true; return load(); })
      .catch(function (e) { $("payErr").textContent = e.message; $("payErr").hidden = false; load(); })
      .then(function () { b.disabled = false; });
  });

  // ----- אחרי המקדמה: יומן, הודעה לאורי, והדף האישי (/guide) -----
  function meetTime(day) {
    var Lc = C.sunLocation || (window.Sun && window.Sun.DEFAULT) || { lat: 32.08, lon: 34.78 };
    return window.Sun.hhmm(window.Sun.sunsetMs(day, Lc.lat, Lc.lon) - 2 * 3600000);
  }
  function utc(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  var guideUrl = location.origin + "/guide?t=" + encodeURIComponent(token);
  function booked() {
    var Lc = C.sunLocation || window.Sun.DEFAULT, set = window.Sun.sunsetMs(L.day, Lc.lat, Lc.lon);
    var where = L.location || L.pref_location || "";
    var details = [
      "הבוק הזוגי שלנו, עם " + (C.businessName || "אורי") + ".",
      "מפגש משוער: " + meetTime(L.day) + ". את שעת המפגש המדויקת אורי יאשר איתנו בוואטסאפ כמה ימים לפני.",
      L.pref_style ? "הסגנון שבחרנו: " + L.pref_style : "",
      where ? "המקום: " + where : "",
      "", "הדף האישי שלנו (מדריך ההכנה): " + guideUrl, "דף ההזמנה: " + pageUrl
    ].filter(function (x, i) { return x !== "" || i === 4; }).join("\n");
    $("calGoogle").href = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("הבוק הזוגי שלנו 📷") +
      "&dates=" + utc(set - 2 * 3600000) + "/" + utc(set + 20 * 60000) +
      "&ctz=Asia/Jerusalem" +
      "&details=" + encodeURIComponent(details) +
      (where ? "&location=" + encodeURIComponent(where) : "");
    // אפל ואאוטלוק: קובץ יומן מהשרת (נפתח ישירות ביומן באייפון)
    $("calApple").href = "/api/event?t=" + encodeURIComponent(token);
    $("guideLink").href = guideUrl;
    $("finishWa").href = B.waLink(C.whatsappNumber, "היי אורי, כאן " + L.names + ".\nשילמנו את המקדמה, אז " + B.prettyDate(L.day) + " סגור 🎉\nמחכים לערב!");
    var done = !!L.finished_sent_at;
    $("finishWa").className = "btn " + (done ? "btn--ghost" : "btn--primary");
    $("guideLink").className = "btn " + (done ? "btn--primary" : "btn--ghost");
    balance();
  }
  // ----- השלמת תשלום -----
  var balMethod = null;
  function balance() {
    var p = B.pkg(L.package), open = !!L.balance_open_at && !!L.package;
    $("balance").hidden = !open; if (!open) return;
    var paid = !!L.full_paid_at;
    $("balTitle").innerHTML = paid ? "התשלום הושלם ✓ <strong></strong>" : 'השלמת התשלום: <strong id="balAmt"></strong>';
    if (!paid) $("balAmt").textContent = B.money(p.price - B.deposit(p));
    $("balHint").textContent = paid ? "תודה! הכול מסודר, נשאר רק ליהנות מהערב." : "אפשר לשלם עכשיו, או ביום הצילום עצמו.";
    $("balBtns").hidden = paid; $("balDemo").hidden = true;
  }
  document.querySelectorAll("[data-bal]").forEach(function (b) {
    b.addEventListener("click", function () { balMethod = b.getAttribute("data-bal"); $("balDemo").hidden = false; });
  });
  $("balCancel").addEventListener("click", function () { $("balDemo").hidden = true; });
  $("balConfirm").addEventListener("click", function () {
    var b = $("balConfirm"); b.disabled = true;
    B.rpc("lead_pay_balance_demo", { p_token: token, p_method: balMethod })
      .then(load)
      .catch(function (e) { $("balErr").textContent = e.message; $("balErr").hidden = false; })
      .then(function () { b.disabled = false; });
  });

  // ----- אחרי הצילום: תמונות טעימה והמלצה -----
  var shown = {};
  function after() {
    var ph = L.photos || [];
    $("teasers").hidden = !ph.length;
    ph.forEach(function (x, i) {
      if (shown[x.id]) return; shown[x.id] = true;
      var f = document.createElement("figure"); f.className = "teaser";
      f.innerHTML = '<img alt="" /><a class="teaser__dl" download>הורדה</a>';
      $("teaserGrid").appendChild(f);
      B.rpc("lead_photo", { p_token: token, p_id: x.id }).then(function (d) {
        f.querySelector("img").src = d; f.querySelector("img").alt = "תמונה " + (i + 1) + " מהערב שלכם";
        var a = f.querySelector("a"); a.href = d; a.setAttribute("download", x.name || "photo.jpg");
      }).catch(function () { f.remove(); });
    });
    var done = !!L.review;
    $("reviewBox").hidden = done; $("reviewThanks").hidden = !done;
    $("reviewWa").href = B.waLink(C.whatsappNumber, "היי אורי, כאן " + L.names + ". רצינו לספר לך על הערב: ");
  }
  $("reviewBtn").addEventListener("click", function () {
    var t = $("reviewText").value.trim(), e = $("reviewErr");
    if (t.length < 3) { e.textContent = "כתבו בבקשה כמה מילים."; e.hidden = false; return; }
    $("reviewBtn").disabled = true;
    B.rpc("lead_review", { p_token: token, p_text: t }).then(load)
      .catch(function (er) { e.textContent = er.message; e.hidden = false; })
      .then(function () { $("reviewBtn").disabled = false; });
  });

  $("finishWa").addEventListener("click", function () {
    B.rpc("lead_mark", { p_token: token, p_what: "finished_sent" }).catch(function () {});
    setTimeout(function () { L.finished_sent_at = L.finished_sent_at || new Date().toISOString(); booked(); }, 600);
  });

  load();
})();
