/* לוח שנה פשוט בעברית (ראשון עד שבת). אין צורך לערוך כאן. */
(function () {
  "use strict";
  var B = window.Booking;
  var HEAD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  // הערה: החצים ‹ › מתהפכים אוטומטית בכיוון ימין-לשמאל
  // opts: { el, month (Date), minMonth (Date), dayState(iso) -> {disabled, cls, label}, onPick(iso) }
  function Calendar(opts) {
    this.o = opts;
    var m = opts.month || new Date();
    this.month = new Date(m.getFullYear(), m.getMonth(), 1);
    this.render();
  }
  Calendar.prototype.go = function (delta) {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + delta, 1);
    this.render();
  };
  Calendar.prototype.render = function () {
    var o = this.o, self = this, y = this.month.getFullYear(), mo = this.month.getMonth();
    var min = o.minMonth ? new Date(o.minMonth.getFullYear(), o.minMonth.getMonth(), 1) : null;
    var canPrev = !min || this.month > min;
    var html = '<div class="cal__head">' +
      '<button type="button" class="cal__nav" data-nav="-1" aria-label="החודש הקודם"' + (canPrev ? "" : " disabled") + '>‹</button>' +
      '<p class="cal__title">' + B.MONTHS[mo] + " " + y + "</p>" +
      '<button type="button" class="cal__nav" data-nav="1" aria-label="החודש הבא">›</button></div>' +
      '<div class="cal__grid" role="grid">';
    HEAD.forEach(function (h) { html += '<span class="cal__dow" aria-hidden="true">' + h + "</span>"; });
    var first = new Date(y, mo, 1).getDay();
    for (var i = 0; i < first; i++) html += '<span class="cal__pad"></span>';
    var days = new Date(y, mo + 1, 0).getDate();
    for (var d = 1; d <= days; d++) {
      var iso = B.iso(new Date(y, mo, d));
      var st = (o.dayState && o.dayState(iso)) || {};
      html += '<button type="button" class="cal__day ' + (st.cls || "") + '" data-day="' + iso + '"' +
        (st.disabled ? " disabled" : "") + ' aria-label="' + B.prettyDate(iso) + (st.label ? ", " + st.label : "") + '">' + d + "</button>";
    }
    html += "</div>";
    o.el.innerHTML = html;
    o.el.querySelectorAll("[data-nav]").forEach(function (b) {
      b.addEventListener("click", function () { self.go(+b.getAttribute("data-nav")); });
    });
    o.el.querySelectorAll("[data-day]").forEach(function (b) {
      b.addEventListener("click", function () { if (o.onPick) o.onPick(b.getAttribute("data-day")); });
    });
  };
  window.Calendar = Calendar;
})();
