/* הדף האישי של הזוג (/for/<קוד>). אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var $ = function (id) { return document.getElementById(id); };
  var token = decodeURIComponent((location.pathname.split("/for/")[1] || "").split("/")[0] || new URLSearchParams(location.search).get("t") || "");
  var pageUrl = location.origin + "/for/" + token;
  var L = null, sel = { day: null, pkg: null }, cal = null, avail = {}, timer = null;

  B.logo();
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
    var t = "היי אורי, כאן " + L.names + " 🙂" + (extra ? "\n" + extra : "") + "\nהדף שלנו: " + pageUrl;
    return B.waLink(C.whatsappNumber, t);
  }

  var VIEWS = ["vChoose", "vPending", "vDeposit", "vBooked", "vAfter"];
  function view(id) { VIEWS.forEach(function (v) { $(v).hidden = v !== id; }); }

  function track(stage) {
    document.querySelectorAll("#track li").forEach(function (li, i) {
      li.className = i < stage ? "is-done" : i === stage ? "is-now" : "";
    });
  }

  function summary(el) {
    var p = L.package ? B.pkg(L.package) : null, rows = [];
    if (L.day) rows.push(["הערב", B.prettyDate(L.day) + " · שקיעה " + B.sunset(L.day)]);
    if (p) {
      rows.push(["החבילה", p.name]);
      rows.push(["מחיר", B.money(p.price)]);
      rows.push(["מקדמה", B.money(B.deposit(p)) + (L.deposit_paid_at ? " · שולמה ✓" : "")]);
      if (L.deposit_paid_at) rows.push(["יתרה ביום הצילום", B.money(p.price - B.deposit(p))]);
    }
    el.innerHTML = rows.map(function (r) { return "<div><dt>" + B.esc(r[0]) + "</dt><dd>" + B.esc(r[1]) + "</dd></div>"; }).join("");
  }

  function render() {
    $("loading").hidden = true; $("page").hidden = false;
    document.title = L.names + " | הדף האישי שלכם";
    document.querySelectorAll("[data-wa-ctx]").forEach(function (a) { a.href = ctxWa(""); });
    $("topWa").href = ctxWa("");
    document.querySelectorAll("[data-sum]").forEach(summary);
    if (timer) { clearInterval(timer); timer = null; }

    var s = L.status;
    if (s === "lead" || s === "declined" || s === "expired") {
      $("hello").textContent = L.names + ", הנה הערבים שפתוחים בשבילכם";
      $("lead").textContent = "בחרו חבילה וערב, ושלחו לי בקשה. אחזור אליכם אישית לאישור.";
      track(1); view("vChoose"); choose();
      var note = s === "declined" ? "הערב שבחרתם קודם לא התאפשר הפעם. אשמח שתבחרו ערב אחר, או שנמצא אחד יחד בוואטסאפ."
        : s === "expired" ? "זמן ההחזקה של התאריך הקודם הסתיים, והוא שוחרר. אפשר לבחור שוב ערב פנוי." : "";
      $("chooseNote").textContent = note; $("chooseNote").hidden = !note;
    } else if (s === "pending") {
      $("hello").textContent = L.names + ", הבקשה שלכם בדרך אליי";
      $("lead").textContent = "";
      track(2); view("vPending");
    } else if (s === "awaiting_deposit") {
      $("hello").textContent = L.names + ", התאריך מוחזק עבורכם";
      $("lead").textContent = "נשאר רק צעד אחד: מקדמה קטנה, והערב שלכם.";
      track(3); view("vDeposit"); deposit();
    } else if (s === "booked") {
      $("hello").textContent = L.names + ", נתראה בשקיעה";
      $("lead").textContent = "";
      track(5); view("vBooked");
    } else {
      $("hello").textContent = L.names + ", תודה על ערב מקסים";
      $("lead").textContent = "";
      $("afterTitle").textContent = s === "delivered" ? "התמונות שלכם אצלכם 🤍" : "עכשיו אני עורך את התמונות שלכם";
      $("afterText").textContent = s === "delivered"
        ? "היה לי כיף גדול לצלם אתכם. אם תרצו לשתף כמה מילים על החוויה, זה עוזר לי מאוד ואשמח לשמוע."
        : "אני עובר על כל פריים בשקט ובקפידה. ברגע שהגלריה תהיה מוכנה, אשלח לכם אותה בוואטסאפ ובמייל.";
      track(5); view("vAfter");
    }

    var q = new URLSearchParams(location.search);
    if (q.get("welcome") === "1" && s === "lead") {
      welcome();
      history.replaceState(null, "", "/for/" + token);
    }
  }

  // ----- ברוכים הבאים: סיכום הפרטים שנקלטו -----
  function welcome() {
    $("wTitle").textContent = L.names + " 🤍";
    var items = [];
    if (L.occasion) items.push("הסיבה: " + L.occasion);
    if (L.landscape) items.push("הנוף: " + L.landscape.split(",").join(", "));
    if (L.timing) items.push("מתי: " + L.timing);
    if (L.email) items.push("מייל לקבלות ולתמונות: " + L.email);
    $("wList").innerHTML = items.map(function (t) { return "<li>" + B.esc(t) + "</li>"; }).join("");
    $("wWa").href = B.waLink(C.whatsappNumber,
      "היי אורי! כאן " + L.names + " 🙂\nמילאנו את השאלון באתר:\n" + items.map(function (t) { return "• " + t; }).join("\n") +
      "\nהדף שלנו: " + pageUrl);
    openDlg($("welcomeDlg"));
  }

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
          return { disabled: !ok, cls: (ok ? "is-open" : "is-closed") + (iso === sel.day ? " is-selected" : ""), label: ok ? "פנוי, שקיעה " + B.sunset(iso) : "לא פנוי" };
        },
        onPick: function (iso) { sel.day = iso; cal.render(); sum(); }
      });
    } else cal.render();
    sum();
  }

  function sum() {
    var p = B.pkg(sel.pkg), rows = [];
    $("picked").hidden = !sel.day;
    if (sel.day) $("picked").textContent = B.prettyDate(sel.day) + " · שקיעה " + B.sunset(sel.day);
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
      .then(function () { btn.disabled = false; btn.textContent = "שליחת בקשה לשריון"; });
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
    var until = new Date(L.hold_until).getTime();
    function tick() {
      var left = until - Date.now();
      if (left <= 0) { clearInterval(timer); load(); return; }
      var h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000);
      $("hold").innerHTML = "<strong>שמור עבורכם עד " + B.esc(B.holdText(L.hold_until)) + "</strong>" +
        "<span>נשארו " + h + " שעות ו-" + m + " דקות. אחרי זה התאריך חוזר להיות פנוי לזוגות אחרים.</span>";
    }
    tick(); timer = setInterval(tick, 30000);
    $("hText").textContent = "אישרתי את הבקשה שלכם ל" + B.prettyDate(L.day) + ". התאריך שמור עבורכם עד " +
      B.holdText(L.hold_until) + " וממתין להשלמת התהליך, כלומר לתשלום המקדמה.";
    var seen = "turgi_hold_seen_" + token + "_" + L.hold_until;
    var was = false; try { was = !!sessionStorage.getItem(seen); sessionStorage.setItem(seen, "1"); } catch (e) {}
    if (!was) openDlg($("holdDlg"));
  }
  var method = null;
  document.querySelectorAll("[data-pay]").forEach(function (b) {
    b.addEventListener("click", function () {
      method = b.getAttribute("data-pay");
      $("payName").textContent = method === "bit" ? "Bit" : "סליקת האשראי";
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

  // ----- הוספה ליומן של הזוג (תאריך בלבד, בלי שעה) -----
  $("icsBtn").addEventListener("click", function () {
    var d = L.day.replace(/-/g, ""), n = B.parseIso(L.day); n.setDate(n.getDate() + 1);
    var e = B.iso(n).replace(/-/g, "");
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turgeman Ori//Booking//HE", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + token + "@turgi", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + e,
      "SUMMARY:בוק זוגי בשקיעה עם " + (C.businessName || "אורי"),
      "DESCRIPTION:את שעת המפגש והמיקום אשלח בוואטסאפ כמה ימים לפני. הדף שלכם: " + pageUrl,
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "boq-zugi.ics"; document.body.appendChild(a); a.click(); a.remove();
  });

  load();
})();
