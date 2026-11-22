/* דף ההזמנה: תאריך → חבילה → פרטים → שליחה. אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var state = { day: null, pkg: null, open: {} };

  var $ = function (id) { return document.getElementById(id); };
  var waGeneral = B.waLink(C.whatsappNumber, C.whatsappMessage);
  document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = waGeneral; });
  if (C.logo) document.documentElement.style.setProperty("--logo-url", "url('" + C.logo + "')");

  // ----- חבילות -----
  var pkWrap = $("pkgs");
  (C.packages || []).forEach(function (p, i) {
    var id = "pkg-" + p.id;
    var el = document.createElement("label");
    el.className = "pkg";
    el.setAttribute("for", id);
    el.innerHTML =
      '<input type="radio" name="package" id="' + id + '" value="' + p.id + '" />' +
      '<span class="pkg__top"><span class="pkg__name"></span><span class="pkg__price"><bdi>₪' + Number(p.price).toLocaleString("he-IL") + "</bdi></span></span>" +
      '<ul class="pkg__list"></ul>';
    el.querySelector(".pkg__name").textContent = p.name;
    var ul = el.querySelector(".pkg__list");
    (p.features || []).forEach(function (f) { var li = document.createElement("li"); li.textContent = f; ul.appendChild(li); });
    el.querySelector("input").addEventListener("change", function () { state.pkg = p.id; clearError(); });
    pkWrap.appendChild(el);
  });

  // ----- לוח שנה -----
  var cal;
  function dayState(iso) {
    var open = !!state.open[iso];
    return {
      disabled: !open,
      cls: (open ? "is-open" : "is-closed") + (state.day === iso ? " is-selected" : ""),
      label: open ? (state.day === iso ? "נבחר" : "פנוי") : "לא פנוי"
    };
  }
  function pick(iso) {
    state.day = iso;
    cal.render();
    var p = $("pickedDate");
    p.textContent = "נבחר: " + B.prettyDate(iso);
    p.hidden = false;
    clearError();
  }

  B.rpc("public_open_dates").then(function (rows) {
    (rows || []).forEach(function (r) { state.open[r.day || r] = true; });
    var days = Object.keys(state.open).sort();
    var start = days.length ? B.parseIso(days[0]) : new Date();
    cal = new window.Calendar({ el: $("cal"), month: start, minMonth: new Date(), dayState: dayState, onPick: pick });
    if (!days.length) { $("noDates").hidden = false; }
  }).catch(function () {
    $("cal").innerHTML = '<p class="cal__loading">לא הצלחנו לטעון את הלוח כרגע. נסו לרענן, או כתבו לי בוואטסאפ.</p>';
  });

  // ----- שליחה -----
  function showError(msg) { var e = $("formError"); e.textContent = msg; e.hidden = false; }
  function clearError() { $("formError").hidden = true; }

  $("bookForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("fName").value.trim(), phone = $("fPhone").value.trim(), note = $("fNote").value.trim();
    if (!state.day) return showError("בחרו בבקשה תאריך מהלוח.");
    if (!state.pkg) return showError("בחרו בבקשה חבילה.");
    if (name.length < 2) { $("fName").focus(); return showError("כתבו בבקשה את השמות שלכם."); }
    if (phone.replace(/\D/g, "").length < 9) { $("fPhone").focus(); return showError("בדקו בבקשה את מספר הטלפון."); }

    var btn = $("submitBtn");
    btn.disabled = true; btn.textContent = "שולח…";
    B.rpc("create_booking", { p_day: state.day, p_package: state.pkg, p_name: name, p_phone: phone, p_note: note || null })
      .then(function () {
        var p = B.pkg(state.pkg);
        var msg = "היי אורי, שלחנו עכשיו בקשה לבוק זוגי ✨\n" +
          "תאריך: " + B.prettyDate(state.day) + "\n" +
          "חבילה: " + p.name + " (₪" + p.price + ")\n" +
          "שמות: " + name + "\nטלפון: " + phone + (note ? "\nהערות: " + note : "");
        $("doneWa").href = B.waLink(C.whatsappNumber, msg);
        $("doneText").textContent = "ביקשתם את " + B.prettyDate(state.day) + ", " + p.name + ". אבדוק את הבקשה ואחזור אליכם לאישור ולתיאום הלוקיישן.";
        $("bookForm").hidden = true;
        document.querySelector(".book__intro").hidden = true;
        var done = $("done"); done.hidden = false; done.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        showError(err.message);
        if (err.code === "DATE_NOT_AVAILABLE") { delete state.open[state.day]; state.day = null; $("pickedDate").hidden = true; if (cal) cal.render(); }
      })
      .then(function () { btn.disabled = false; btn.textContent = "שליחת בקשה לשריון"; });
  });
})();
