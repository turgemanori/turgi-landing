/* דף המנהל. אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "turgi_admin_pass";
  var pass = null, data = { dates: [], bookings: [] }, open = {}, original = {}, filter = "pending", cal;
  var today = B.iso(new Date());
  var bookUrl = location.origin + "/book";

  if (C.logo) document.documentElement.style.setProperty("--logo-url", "url('" + C.logo + "')");

  function store(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) {} }
  function stored() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }

  function err(id, msg) { var e = $(id); e.textContent = msg || ""; e.hidden = !msg; }

  // ----- כניסה -----
  function login(p) {
    $("loginBtn").disabled = true;
    return B.rpc("admin_get", { p_pass: p }).then(function (res) {
      pass = p; store(p); data = res || data;
      $("loginForm").hidden = true; $("dash").hidden = false; $("logoutBtn").hidden = false;
      setup();
    }).catch(function (e) {
      store(null);
      err("loginError", e.message);
    }).then(function () { $("loginBtn").disabled = false; });
  }
  $("loginForm").addEventListener("submit", function (ev) { ev.preventDefault(); err("loginError"); login($("loginPass").value); });
  $("logoutBtn").addEventListener("click", function () { store(null); location.reload(); });
  var s = stored(); if (s) login(s);

  function reload() {
    return B.rpc("admin_get", { p_pass: pass }).then(function (res) { data = res; setup(); })
      .catch(function (e) { err("dashError", e.message); });
  }

  // ----- לוח -----
  function bookingsOn(iso) { return data.bookings.filter(function (b) { return b.day === iso; }); }
  function dayState(iso) {
    var past = iso < today, bs = bookingsOn(iso);
    var approved = bs.some(function (b) { return b.status === "approved"; });
    var pending = bs.some(function (b) { return b.status === "pending"; });
    var cls = [];
    if (past) cls.push("is-past");
    if (approved) cls.push("is-booked"); else if (open[iso]) cls.push("is-open");
    if (pending) cls.push("is-pending");
    return { disabled: past || approved, cls: cls.join(" "), label: approved ? "מאושר" : open[iso] ? "פתוח" : "סגור" };
  }
  function dirty() {
    var a = Object.keys(open).filter(function (d) { return open[d] && !original[d]; });
    var r = Object.keys(original).filter(function (d) { return !open[d]; });
    return { add: a, remove: r };
  }
  function refreshSave() {
    var d = dirty(), n = d.add.length + d.remove.length;
    $("saveDates").disabled = n === 0;
    $("saveDates").textContent = n ? "שמירה (" + n + " שינויים)" : "שמירה";
  }

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
    renderList();
    $("shareWa").href = "https://wa.me/?text=" + encodeURIComponent("היי! כאן אפשר לראות את התאריכים הפנויים לבוק זוגי ולבחור חבילה ✨\n" + bookUrl);
  }

  $("saveDates").addEventListener("click", function () {
    var d = dirty(), btn = $("saveDates");
    btn.disabled = true;
    B.rpc("admin_set_dates", { p_pass: pass, p_add: d.add, p_remove: d.remove })
      .then(function () { $("savedNote").textContent = "נשמר ✓"; return reload(); })
      .catch(function (e) { err("dashError", e.message); refreshSave(); });
  });

  $("copyLink").addEventListener("click", function () {
    var b = $("copyLink");
    var done = function () { b.textContent = "הקישור הועתק ✓"; setTimeout(function () { b.textContent = "העתקת קישור ההזמנה"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(bookUrl).then(done, function () { prompt("העתיקו את הקישור:", bookUrl); });
    else prompt("העתיקו את הקישור:", bookUrl);
  });

  // ----- רשימת בקשות -----
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      filter = t.getAttribute("data-filter");
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("is-active", x === t); });
      renderList();
    });
  });

  var LABEL = { pending: "ממתינה", approved: "מאושרת", declined: "נדחתה" };
  function renderList() {
    var ul = $("blist"); ul.innerHTML = "";
    var list = data.bookings.filter(function (b) { return b.status === filter; });
    document.querySelector('.tab[data-filter="pending"]').textContent =
      "ממתינות (" + data.bookings.filter(function (b) { return b.status === "pending"; }).length + ")";
    if (!list.length) { ul.innerHTML = '<li class="empty">אין כאן בקשות כרגע.</li>'; return; }
    list.forEach(function (b) {
      var p = B.pkg(b.package);
      var li = document.createElement("li"); li.className = "bcard";
      li.innerHTML =
        '<div class="bcard__top"><span class="bcard__date"></span><span class="badge badge--' + b.status + '">' + LABEL[b.status] + "</span></div>" +
        '<div class="bcard__meta"><strong class="n"></strong> · <bdi dir="ltr" class="bphone"></bdi></div>' +
        '<div class="bcard__meta pk"></div>' +
        (b.note ? '<div class="bcard__note"></div>' : "") +
        '<div class="admin__actions"></div>';
      li.querySelector(".bcard__date").textContent = B.prettyDate(b.day);
      li.querySelector(".n").textContent = b.name;
      li.querySelector(".bphone").textContent = b.phone;
      li.querySelector(".pk").textContent = p.name + " · ₪" + p.price;
      if (b.note) li.querySelector(".bcard__note").textContent = b.note;
      var act = li.querySelector(".admin__actions");
      function btn(text, cls, fn) { var x = document.createElement("button"); x.type = "button"; x.className = "btn btn--sm " + cls; x.textContent = text; x.onclick = fn; act.appendChild(x); }
      if (b.status !== "approved") btn("אישור", "btn--primary", function () { setStatus(b, "approved"); });
      if (b.status !== "declined") btn(b.status === "approved" ? "ביטול" : "דחייה", "btn--ghost", function () { setStatus(b, "declined"); });
      if (b.status === "declined") btn("החזרה להמתנה", "btn--ghost", function () { setStatus(b, "pending"); });
      var wa = document.createElement("a");
      wa.className = "btn btn--ghost btn--sm"; wa.target = "_blank"; wa.rel = "noopener"; wa.textContent = "וואטסאפ";
      wa.href = B.waLink(b.phone, b.status === "approved"
        ? "היי " + b.name + ", הבוק ב" + B.prettyDate(b.day) + " מאושר! ✨ נדבר על הלוקיישן והשעה."
        : "היי " + b.name + ", קיבלתי את הבקשה לבוק ב" + B.prettyDate(b.day) + " 🙂");
      act.appendChild(wa);
      ul.appendChild(li);
    });
  }

  function setStatus(b, status) {
    B.rpc("admin_set_status", { p_pass: pass, p_id: b.id, p_status: status })
      .then(reload)
      .catch(function (e) { err("dashError", e.message); });
  }

  // ----- סיסמה -----
  $("pwForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var np = $("newPass").value;
    B.rpc("admin_change_password", { p_pass: pass, p_new: np }).then(function () {
      pass = np; store(np); $("newPass").value = ""; $("pwNote").textContent = "הסיסמה עודכנה ✓";
    }).catch(function (e) { $("pwNote").textContent = e.message; });
  });
})();
