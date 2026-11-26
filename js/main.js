/* ==========================================================
   לוגיקה של הדף. אין צורך לערוך כאן: כל ההגדרות ב-js/config.js
   ========================================================== */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  document.documentElement.classList.remove("no-js");

  // ----- טקסטים שנערכו בדף המנהל (נשמרים ב-Supabase, טבלת site_texts) -----
  // טקסט שלא נערך נשאר כמו שהוא כתוב ב-index.html.
  var TEXTS_KEY = "site_texts_v1";
  function applyTexts(map) {
    if (!map || typeof map !== "object") return;
    document.querySelectorAll("[data-t]").forEach(function (el) {
      var key = el.getAttribute("data-t");
      if (!el.hasAttribute("data-t-orig")) el.setAttribute("data-t-orig", el.textContent);
      var v = map[key];
      el.textContent = typeof v === "string" && v.trim() ? v : el.getAttribute("data-t-orig");
    });
  }
  try { applyTexts(JSON.parse(localStorage.getItem(TEXTS_KEY) || "null")); } catch (e) {}
  if (C.supabaseUrl && C.supabaseKey && window.fetch) {
    fetch(C.supabaseUrl + "/rest/v1/rpc/public_site_texts", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseKey },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (map) {
      if (!map) return;
      applyTexts(map);
      try { localStorage.setItem(TEXTS_KEY, JSON.stringify(map)); } catch (e) {}
    }).catch(function () {});
  }

  // ----- קישורי וואטסאפ ואינסטגרם -----
  var waNumber = String(C.whatsappNumber || "").replace(/\D/g, "");
  var waUrl = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(C.whatsappMessage || "");
  var igHandle = String(C.instagramHandle || "").replace(/^@/, "");
  var igUrl = "https://www.instagram.com/" + igHandle + "/";

  var waGiftUrl = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(C.whatsappGiftMessage || C.whatsappMessage || "");
  document.querySelectorAll("[data-wa]").forEach(function (a) {
    a.href = a.getAttribute("data-wa") === "gift" ? waGiftUrl : waUrl;
  });
  document.querySelectorAll("[data-ig]").forEach(function (a) { a.href = igUrl; });

  // ----- טקסטים מתוך ההגדרות -----
  var binds = {
    businessName: C.businessName || "",
    instagramAt: igHandle ? "@" + igHandle : "",
    locationDot: C.location ? "· " + C.location : "",
    deliveryTime: C.deliveryTime || "",
    depositPercent: String(C.depositPercent || 10)
  };
  // פריטים שתלויים בהגדרה שעוד לא מולאה (למשל זמן מסירה) מוסתרים
  document.querySelectorAll("[data-needs]").forEach(function (el) {
    if (!C[el.getAttribute("data-needs")]) el.hidden = true;
  });
  document.querySelectorAll("[data-bind]").forEach(function (el) {
    var key = el.getAttribute("data-bind");
    if (key in binds) el.textContent = binds[key];
  });
  if (C.businessName) document.title = C.businessName + " | בוקים זוגיים";
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ----- לוגו -----
  if (C.logo) document.documentElement.style.setProperty("--logo-url", "url('" + C.logo + "')");

  // ----- תמונת פתיחה -----
  var hero = document.getElementById("heroMedia");
  if (hero) {
    if (C.heroImage) hero.style.backgroundImage = "url('" + C.heroImage + "')";
    else hero.classList.add("is-placeholder");
  }

  // ----- תמונת "למה דווקא איתי" -----
  var about = document.getElementById("aboutMedia");
  if (about && C.aboutImage) {
    var aImg = new Image();
    aImg.src = C.aboutImage;
    aImg.alt = about.getAttribute("aria-label") || "";
    aImg.loading = "lazy";
    aImg.decoding = "async";
    about.replaceWith(aImg);
  } else if (about) {
    about.innerHTML = '<span class="ph__label">כאן תופיע תמונה שלך בעבודה (4:5)</span>';
  }

  // ----- המלצות -----
  // קודם ההמלצות שאישרת בדף המנהל (מ-Supabase, החדשות קודם, עם תאריך).
  // אם עוד אין כאלה, מוצגות ההמלצות מתוך js/config.js.
  var vGrid = document.getElementById("voicesGrid");
  var io = null, ioReady = false;
  // פריט שנוסף אחרי טעינת הדף (המלצות מהמסד) מצטרף לאנימציית החשיפה
  function revealLater(el) { if (io) io.observe(el); else if (ioReady) el.classList.add("is-in"); }
  var MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  function voiceDate(s) {
    var p = String(s || "").split("-");
    return p.length === 3 ? (+p[2]) + " ב" + MONTHS[+p[1] - 1] + " " + p[0] : "";
  }
  function renderVoices(list, demo) {
    if (!vGrid || !list.length) return;
    vGrid.innerHTML = "";
    var old = document.querySelector(".voices__demo"); if (old) old.remove();
    var more = document.querySelector(".voices__more"); if (more) more.remove();
    list.forEach(function (v, i) {
      var fig = document.createElement("figure"); fig.className = "voice reveal";
      if (i >= 6) fig.hidden = true;
      var q = document.createElement("blockquote"); q.textContent = "״" + v.text + "״";
      var cap = document.createElement("figcaption");
      var who = document.createElement("strong"); who.textContent = v.who;
      var what = document.createElement("span"); what.textContent = v.what || "";
      cap.appendChild(who); cap.appendChild(what);
      if (v.date) {
        var t = document.createElement("time"); t.className = "voice__date";
        t.dateTime = v.date; t.textContent = voiceDate(v.date);
        cap.appendChild(t);
      }
      fig.appendChild(q); fig.appendChild(cap);
      vGrid.appendChild(fig);
      revealLater(fig);
    });
    if (list.length > 6) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn btn--ghost voices__more";
      b.textContent = "עוד המלצות (" + (list.length - 6) + ")";
      b.addEventListener("click", function () {
        vGrid.querySelectorAll(".voice[hidden]").forEach(function (f) { f.hidden = false; f.classList.add("is-in"); });
        b.remove();
      });
      vGrid.after(b);
    }
    if (demo) {
      var note = document.createElement("p"); note.className = "voices__demo"; note.textContent = "טקסט לדוגמה";
      vGrid.after(note);
    }
    document.getElementById("voices").hidden = false;
  }
  function configVoices() {
    if (Array.isArray(C.testimonials) && C.testimonials.length) renderVoices(C.testimonials, C.testimonialsDemo);
  }
  if (vGrid && C.supabaseUrl && C.supabaseKey && window.fetch) {
    fetch(C.supabaseUrl + "/rest/v1/rpc/public_reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseKey },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
      if (Array.isArray(list) && list.length) {
        renderVoices(list.map(function (v) { return { text: v.text, who: v.names, what: v.what, date: v.date }; }), false);
      } else configVoices();
    }).catch(configVoices);
  } else if (vGrid) configVoices();

  // ----- גלריה -----
  var grid = document.getElementById("galleryGrid");
  var ratioNames = { portrait: "4:5", tall: "2:3", landscape: "3:2", square: "1:1" };
  if (grid && Array.isArray(C.gallery)) {
    C.gallery.forEach(function (item) {
      var ratio = ratioNames[item.ratio] ? item.ratio : "portrait";
      var fig = document.createElement("figure");
      fig.className = "masonry__item reveal r-" + ratio;
      if (item.src) {
        var img = new Image();
        img.src = item.src;
        img.alt = item.alt || "";
        img.loading = "lazy";
        img.decoding = "async";
        fig.appendChild(img);
      } else {
        var ph = document.createElement("div");
        ph.className = "ph";
        ph.setAttribute("role", "img");
        ph.setAttribute("aria-label", item.alt || "");
        var label = document.createElement("span");
        label.className = "ph__label";
        label.textContent = (item.alt || "תמונה") + " (" + ratioNames[ratio] + ")";
        ph.appendChild(label);
        fig.appendChild(ph);
      }
      grid.appendChild(fig);
    });
  }

  // ----- כותרת עליונה וכפתור צף בגלילה -----
  var topbar = document.getElementById("topbar");
  var fab = document.getElementById("fab");
  var topCta = document.getElementById("topCta");
  var heroCta = document.querySelector(".hero__actions .btn--primary");
  var heroEl = document.querySelector(".hero");
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (topbar) topbar.classList.toggle("is-scrolled", y > 40);
    if (fab && heroEl) fab.classList.toggle("is-visible", y > heroEl.offsetHeight * 0.7);
    // הכפתור העליון מופיע רק אחרי שהכפתור המרכזי בפתיחה כבר לא על המסך
    if (topCta) {
      var past = heroCta ? heroCta.getBoundingClientRect().bottom < 0 : y > 400;
      topCta.classList.toggle("is-shown", past);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ----- אנימציית חשיפה בגלילה -----
  // פריטים שנכנסים למסך יחד נחשפים אחד אחרי השני (בהפרש קטן)
  var items = document.querySelectorAll(".reveal");
  ioReady = true;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      var k = 0;
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.style.setProperty("--rd", Math.min(k++, 5) * 0.12 + "s");
          e.target.classList.add("is-in"); io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
})();
