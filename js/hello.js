/* שאלון ההיכרות (/hello). אין צורך לערוך כאן. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var $ = function (id) { return document.getElementById(id); };
  var steps = Array.prototype.slice.call(document.querySelectorAll(".q"));
  var LAST = steps.length - 1, cur = 0, DRAFT = "turgi_hello_draft";

  B.logo();
  document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = B.waLink(C.whatsappNumber, C.whatsappMessage); });
  // שליחת שם האינסטגרם בוואטסאפ, למי שלא בא לו להקליד כאן
  function igWa() {
    var n = $("fNames").value.trim();
    $("igWa").href = B.waLink(C.whatsappNumber, "היי אורי" + (n ? ", כאן " + n : "") + ". זה האינסטגרם שלנו: @");
  }

  // ----- בחירה בצ'יפים -----
  document.querySelectorAll(".chips").forEach(function (g) {
    var single = g.hasAttribute("data-single");
    g.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", function () {
        var on = c.getAttribute("aria-pressed") !== "true";
        if (single || c.hasAttribute("data-solo")) {
          g.querySelectorAll(".chip").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        } else {
          var solo = g.querySelector("[data-solo]"); if (solo) solo.setAttribute("aria-pressed", "false");
        }
        c.setAttribute("aria-pressed", on ? "true" : "false");
        save();
        if (g.getAttribute("data-group") === "occasion") $("e2").hidden = true;
        if (single && on) setTimeout(next, 260);
      });
    });
  });
  function picked(group) {
    return Array.prototype.map.call(
      document.querySelectorAll('[data-group="' + group + '"] .chip[aria-pressed="true"]'),
      function (c) { return c.textContent.trim(); });
  }
  function setPicked(group, values) {
    document.querySelectorAll('[data-group="' + group + '"] .chip').forEach(function (c) {
      c.setAttribute("aria-pressed", values.indexOf(c.textContent.trim()) > -1 ? "true" : "false");
    });
  }

  // ----- טיוטה (אם יצאו באמצע) -----
  function save() {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({
        names: $("fNames").value, phone: $("fPhone").value, ig: $("fIg").value,
        occasion: picked("occasion"), landscape: picked("landscape"), timing: picked("timing")
      }));
    } catch (e) {}
  }
  try {
    var d = JSON.parse(sessionStorage.getItem(DRAFT) || "null");
    if (d) {
      $("fNames").value = d.names || ""; $("fPhone").value = d.phone || ""; $("fIg").value = d.ig || "";
      setPicked("occasion", d.occasion || []); setPicked("landscape", d.landscape || []); setPicked("timing", d.timing || []);
    }
  } catch (e) {}
  ["fNames", "fPhone", "fIg"].forEach(function (id) { $(id).addEventListener("input", save); });
  $("fNames").addEventListener("input", igWa); igWa();

  // ----- ניווט -----
  function show(i) {
    cur = Math.max(0, Math.min(LAST, i));
    steps.forEach(function (s, k) { s.classList.toggle("is-active", k === cur); });
    $("nav").hidden = cur === 0;
    $("nextBtn").textContent = cur === LAST ? "סיימנו למלא" : "המשך";
    $("bar").style.width = (cur / LAST * 100) + "%";
    var f = steps[cur].querySelector("input");
    if (f && window.matchMedia("(min-width: 640px)").matches) setTimeout(function () { f.focus(); }, 320);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function valid() {
    if (cur === 1) { var ok = $("fNames").value.trim().length >= 2; $("e1").hidden = ok; return ok; }
    if (cur === 2) { var ok2 = picked("occasion").length > 0; $("e2").hidden = ok2; return ok2; }
    if (cur === 3) { var ok3 = picked("landscape").length > 0; $("e3").hidden = ok3; return ok3; }
    if (cur === 5) {
      var phone = $("fPhone").value.replace(/[^0-9+]/g, "");
      var msg = phone.length < 9 ? "כתבו בבקשה מספר וואטסאפ תקין." : "";
      $("e5").textContent = msg; $("e5").hidden = !msg; return !msg;
    }
    return true;
  }
  function next() {
    if (!valid()) return;
    if (cur === LAST) return submit();
    if (cur === 0 && window.Track) window.Track("quiz_start");
    show(cur + 1);
  }
  document.querySelectorAll("[data-next]").forEach(function (b) { b.addEventListener("click", next); });
  document.querySelector("[data-back]").addEventListener("click", function () { show(cur - 1); });
  $("quiz").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); next(); }
  });
  $("quiz").addEventListener("submit", function (e) { e.preventDefault(); next(); });

  // ----- שליחה -----
  function submit() {
    var btn = $("nextBtn");
    btn.disabled = true; btn.textContent = "מכין את הדף שלכם…";
    B.rpc("lead_create", {
      p_names: $("fNames").value.trim(),
      p_phone: $("fPhone").value.trim(),
      p_email: "",
      p_instagram: $("fIg").value.trim().replace(/^@+/, "").replace(/\s+/g, ""),
      p_occasion: picked("occasion")[0] || "",
      p_landscape: picked("landscape").join(","),
      p_timing: picked("timing")[0] || ""
    }).then(function (token) {
      try { sessionStorage.removeItem(DRAFT); localStorage.setItem("turgi_my_page", token); } catch (e) {}
      if (window.Track) window.Track("quiz_done", token);
      location.href = "/for/" + encodeURIComponent(token) + "?welcome=1";
    }).catch(function (e) {
      $("e5").textContent = e.message; $("e5").hidden = false;
      btn.disabled = false; btn.textContent = "סיימנו למלא";
    });
  }

  show(0);
})();
