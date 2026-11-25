/* מדריך ההכנה (/guide). עם ?t=<קוד הזוג> הוא הופך לאישי: שמות, פרטי הערב והמלצת לבוש לפי הסגנון. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {}, B = window.Booking;
  var $ = function (id) { return document.getElementById(id); };
  B.logo();

  function setWa(text) {
    document.querySelectorAll("[data-wa]").forEach(function (a) { a.href = B.waLink(C.whatsappNumber, text); });
  }
  setWa("היי אורי, יש לי שאלה על ההכנה לצילום");

  // ----- תמונות -----
  var imgs = C.guideImages || {};
  document.querySelectorAll("[data-img]").forEach(function (el) {
    var src = imgs[el.getAttribute("data-img")];
    if (src) { el.style.backgroundImage = "url('" + src + "')"; el.classList.add("has-img"); }
  });

  // ----- רשימת משימות (נשמרת בטלפון, לכל זוג בנפרד) -----
  var token = (new URLSearchParams(location.search).get("t") || "").replace(/[^a-zA-Z0-9]/g, "");
  var KEY = "turgi_guide_todo" + (token ? "_" + token : ""), st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var boxes = document.querySelectorAll("#todoList input");
  function prog() {
    var n = 0; boxes.forEach(function (b) { if (b.checked) n++; });
    $("todoProgress").textContent = n === boxes.length ? "הכול מוכן. נתראה בשקיעה" : n + " מתוך " + boxes.length + " משימות";
  }
  boxes.forEach(function (b) {
    b.checked = !!st[b.getAttribute("data-k")];
    b.addEventListener("change", function () { st[b.getAttribute("data-k")] = b.checked; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} prog(); });
  });
  prog();

  if (!token) return;

  // ----- מדריך אישי -----
  // טיפ לפי המקום (מהשאלון הראשון), והלוק שמתאים כשבחרו "סומכים עליך"
  var PLACE = {
    "ים": { look: 3, tip: "בים יש רוח, אז כדאי בדים קלים שזזים יפה, ולהיות מוכנים שהשיער יתבדר. על החול הכי יפה יחפים, אז מספיקות נעליים נוחות להגעה." },
    "שדות": { look: 2, tip: "בשדות גווני אדמה ושמנת מתמזגים עם הזהב של העשב. כדאי נעליים סגורות להליכה בשבילים." },
    "מדבר": { look: 2, tip: "במדבר טרקוטה, חול וחום נראים כמו חלק מהנוף. אחרי השקיעה מתקרר מהר, אז קחו שכבה חמה." },
    "עיר": { look: 1, tip: "בעיר אפשר להתלבש קצת יותר אלגנטי: ז׳קט בהיר, שמלה פשוטה וגזרות נקיות." },
    "בבית": { look: 1, tip: "בבית הכי טוב משהו נוח ואישי: סריג רך, פשתן, גוונים שקטים שמתאימים לבית שלכם." }
  };

  B.rpc("lead_get", { p_token: token }).then(function (L) {
    if (!L || !L.names) return;
    document.title = L.names + " | מדריך ההכנה שלכם";
    $("gTitle").textContent = L.names + ", ככה מתכוננים לערב שלכם";
    $("gPage").href = "/for/" + encodeURIComponent(token);
    setWa("היי אורי, כאן " + L.names + ". יש לנו שאלה על ההכנה לצילום");
    $("gOriText").textContent = "היי " + L.names + ", אני זמין לכם בכל שלב. לא בטוחים מה ללבוש? מתלבטים בין שני לוקים? רוצים להפתיע? פשוט כתבו לי, ונחליט יחד.";

    // פרטי הערב
    var rows = [], where = L.location || L.pref_location || "";
    if (L.day) {
      var Lc = C.sunLocation || window.Sun.DEFAULT;
      var meet = window.Sun.hhmm(window.Sun.sunsetMs(L.day, Lc.lat, Lc.lon) - 2 * 3600000);
      rows.push(["הערב", B.prettyDate(L.day)]);
      rows.push(["שקיעה", B.sunset(L.day) + " · מפגש משוער " + meet]);
    }
    if (where) rows.push(["המקום", where]);
    if (L.package) rows.push(["החבילה", B.pkg(L.package).name]);
    if (L.pref_style) rows.push(["הסגנון שבחרתם", L.pref_style]);
    if (rows.length) {
      $("gSum").innerHTML = rows.map(function (r) { return "<div><dt>" + B.esc(r[0]) + "</dt><dd>" + B.esc(r[1]) + "</dd></div>"; }).join("");
      $("gMine").hidden = false;
    }
    if (L.day) $("gEveNote").textContent = "את שעת המפגש המדויקת" + (where ? "" : " ואת המיקום") + " אאשר איתכם בוואטסאפ כמה ימים לפני " + B.prettyDate(L.day) + ".";

    // המלצת לבוש לפי הסגנון והמקום
    var style = (C.photoStyles || []).filter(function (s) { return s.name === L.pref_style; })[0];
    var places = (L.landscape || "").split(",").map(function (x) { return x.trim(); }).filter(function (x) { return PLACE[x]; });
    var place = PLACE[places[0]];
    var look = style && style.look ? style.look : place ? place.look : 0;
    if (style || place) {
      $("gPickTitle").textContent = "ההמלצה שלי בשבילכם";
      $("gPickText").textContent = style ? style.tip : "";
      $("gPickText").hidden = !style;
      $("gPlaceText").textContent = place ? place.tip : "";
      $("gPlaceText").hidden = !place;
      $("gPick").hidden = false;
    }
    if (look) {
      var el = document.querySelector('.g-look[data-look="' + look + '"]');
      if (el) {
        el.classList.add("is-pick");
        var tag = document.createElement("span"); tag.className = "g-look__tag"; tag.textContent = "מתאים לכם";
        el.insertBefore(tag, el.firstChild);
        el.parentNode.insertBefore(el, el.parentNode.firstChild);
      }
    }
  }).catch(function () { /* קוד לא תקין: נשאר המדריך הכללי */ });
})();
