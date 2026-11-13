/* Khata and paper website: the three builders, the live previews and the order memo.
   Prices and words come from the page (script#kh-data, written by tools/build.py from site.json);
   the price rules here must match rate_ranges() in tools/build.py. */
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("kh-data").textContent);
  var S = D.s, C = D.calc, BN = D.lang === "bn", STORE = "kh_memo";
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---- numbers ---- */
  function num(v, decimals) {
    var s = Number(v).toLocaleString("en-IN", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
    return BN ? s.replace(/\d/g, function (d) { return "০১২৩৪৫৬৭৮৯"[d]; }) : s;
  }
  function tk(v, decimals) { return "৳" + num(v, decimals); }
  function discount(rows, qty) {
    for (var i = 0; i < rows.length; i++) if (qty >= rows[i][0]) return rows[i][1];
    return 0;
  }
  function out(name, text) { $$('[data-out="' + name + '"]').forEach(function (el) { el.textContent = text; }); }
  function bind(name, text, empty) {
    $$('[data-bind="' + name + '"]').forEach(function (el) {
      if (!el.dataset.fallback) el.dataset.fallback = el.textContent;
      el.textContent = text || el.dataset.fallback;
      if (empty !== undefined) el.classList.toggle("is-empty", !text);
    });
  }
  function radio(form, name) { var el = $('input[name="' + name + '"]:checked', form); return el ? el.value : ""; }
  function clampStep(input) {
    var min = Number(input.min) || 1, step = Number(input.step) || 1, v = Math.round(Number(input.value) || min);
    if (input.name === "reams") v = Math.round(v / step) * step;
    return Math.max(min, Math.min(v, 100000));
  }
  function initials(name) {
    var words = name.trim().split(/\s+/).filter(Boolean).slice(0, BN ? 1 : 2);   // two Bangla letters read as a word
    return words.map(function (w) {
      if (window.Intl && Intl.Segmenter) return new Intl.Segmenter(D.lang, { granularity: "grapheme" }).segment(w)[Symbol.iterator]().next().value.segment;
      return w.charAt(0);
    }).join("").toUpperCase();
  }

  /* ---- 1. school khatas ---- */
  var fSchool = $('[data-form="school"]'), kgBook = $("#kg-book");
  var school = { name: "", motto: "" };
  function readSchool() {
    var c = C.school, qtyInput = $('input[name="qty"]', fSchool);
    var o = { name: school.name.trim(), motto: school.motto.trim(), ruling: radio(fSchool, "ruling"), pages: radio(fSchool, "pages"),
      gsm: radio(fSchool, "gsm"), theme: radio(fSchool, "theme"), qty: clampStep(qtyInput) };
    var full = c.base_by_pages[o.pages] + c.gsm_extra[o.gsm] + (o.ruling === "combo" ? c.combo_extra : 0);
    var off = discount(c.qty_discounts, o.qty);
    o.unit = full - off; o.total = o.unit * o.qty;
    var next = c.qty_discounts.filter(function (r) { return r[0] > o.qty; }).pop();   // rows are sorted high → low
    o.tier = next ? S.tierNext.replace("{n}", num(next[0] - o.qty)).replace("{d}", tk(next[1] - off)) : (off ? S.tierBest : "");
    return o;
  }
  function renderSchool() {
    var o = readSchool();
    $$("[data-book-theme]").forEach(function (b) { b.dataset.theme = o.theme; });
    if (kgBook.dataset.ruling !== o.ruling) { kgBook.dataset.ruling = o.ruling; restartHand(kgBook); }
    bind("school-name", o.name, true); bind("school-motto", o.motto, true);
    bind("school-mono", initials(o.name));
    bind("school-ruling", S.ruling[o.ruling]);
    bind("school-spec", num(o.pages) + " " + S.pages + " · " + num(o.gsm) + " GSM");
    out("school-unit", tk(o.unit)); out("school-total", tk(o.total));
    out("school-qty", num(o.qty) + " " + S.piece); out("school-tier", o.tier);
  }
  function itemSchool() {
    var o = readSchool();
    return { line: S.lineSchool, title: S.ruling[o.ruling] + " × " + num(o.qty),
      detail: [o.name || S.schoolFallback, o.motto, num(o.pages) + " " + S.pages, num(o.gsm) + " GSM", S.theme[o.theme]].filter(Boolean).join(" · "),
      total: o.total };
  }

  /* ---- 2. A4 paper ---- */
  var fA4 = $('[data-form="a4"]');
  function readA4() {
    var c = C.a4, o = { gsm: radio(fA4, "gsm"), plan: radio(fA4, "plan"), reams: clampStep($('input[name="reams"]', fA4)) };
    o.rate = c.base[o.gsm] - discount(c.qty_discounts, o.reams) - (c.plan_discounts[o.plan] || 0);
    o.total = o.rate * o.reams; o.cartons = o.reams / c.carton_reams; o.sheets = o.reams * c.ream_sheets;
    return o;
  }
  function renderA4() {
    var o = readA4(), box = $('[data-bind="a4-cartons"]'), shown = Math.min(o.cartons, 14), html = "";
    bind("a4-gsm", num(o.gsm));
    out("a4-rate", tk(o.rate)); out("a4-total", tk(o.total)); out("a4-sheet", tk(o.rate / C.a4.ream_sheets, 2));
    out("a4-cartons-text", num(o.cartons) + " " + S.carton + " · " + num(o.reams) + " " + S.ream + " · " + num(o.sheets) + " " + S.sheet);
    if (box.childElementCount !== shown + (o.cartons > shown ? 1 : 0)) {
      for (var i = 0; i < shown; i++) html += "<i></i>";
      if (o.cartons > shown) html += "<b>+" + num(o.cartons - shown) + "</b>";
      box.innerHTML = html;
    } else if (o.cartons > shown) { box.lastElementChild.textContent = "+" + num(o.cartons - shown); }
  }
  function itemA4() {
    var o = readA4();
    return { line: S.lineA4, title: "A4 " + num(o.gsm) + " GSM × " + num(o.reams) + " " + S.ream,
      detail: num(o.cartons) + " " + S.carton + " · " + num(o.sheets) + " " + S.sheet + " · " + S.plan[o.plan], total: o.total };
  }

  /* ---- 3. ring khatas ---- */
  var fRing = $('[data-form="ring"]'), ringBook = $("#ring-book");
  var ring = { title: "", name: "" };
  function readRing() {
    var o = { title: ring.title.trim(), name: ring.name.trim(), series: radio(fRing, "series"), paper: radio(fRing, "paper"),
      wire: radio(fRing, "wire"), pack: Number(radio(fRing, "pack")) };
    o.total = C.ring.packs[o.pack]; o.unit = Math.round(o.total / o.pack);
    o.packLabel = o.pack === 1 ? S.single : num(o.pack) + S.pack;
    return o;
  }
  function renderRing() {
    var o = readRing();
    ringBook.dataset.series = o.series; ringBook.dataset.wire = o.wire;
    if (ringBook.dataset.paper !== o.paper) { ringBook.dataset.paper = o.paper; restartHand(ringBook); }
    bind("ring-tag", S.series[o.series]);
    bind("ring-title", o.title, true); bind("ring-name", o.name, true);
    out("ring-total", tk(o.total)); out("ring-unit", tk(o.unit)); out("ring-pack", o.packLabel);
  }
  function itemRing() {
    var o = readRing();
    return { line: S.lineRing, title: S.lineRing + " · " + o.packLabel,
      detail: [o.title, o.name, S.series[o.series], S.paper[o.paper], S.wire[o.wire]].filter(Boolean).join(" · "), total: o.total };
  }

  /* ---- shared form behaviour ---- */
  function restartHand(book) {
    $$(".hand", book).forEach(function (h) { h.style.animation = "none"; void h.offsetWidth; h.style.animation = ""; });
  }
  var FIELDS = { "school-name": [school, "name", renderSchool], "school-motto": [school, "motto", renderSchool],
    "ring-title": [ring, "title", renderRing], "ring-name": [ring, "name", renderRing] };
  $$("[data-field]").forEach(function (input) {
    input.addEventListener("input", function () {
      var f = FIELDS[input.dataset.field];
      f[0][f[1]] = input.value;
      $$('[data-field="' + input.dataset.field + '"]').forEach(function (other) { if (other !== input) other.value = input.value; });
      f[2]();
    });
  });
  [[fSchool, renderSchool], [fA4, renderA4], [fRing, renderRing]].forEach(function (pair) {
    pair[0].addEventListener("change", function (e) {
      if (e.target.type === "number") e.target.value = clampStep(e.target);
      pair[1]();
    });
    pair[0].addEventListener("input", function (e) { if (e.target.type === "number") pair[1](); });
    pair[0].addEventListener("submit", function (e) { e.preventDefault(); });
    $$("[data-step]", pair[0]).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = $("input", btn.parentNode);
        input.value = Number(input.value || 0) + Number(btn.dataset.step);
        input.value = clampStep(input);
        pair[1]();
      });
    });
  });
  $$("[data-flip]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = document.getElementById(btn.dataset.flip).classList.toggle("is-open");
      btn.setAttribute("aria-pressed", open ? "true" : "false");
      $("[data-flip-label]", btn).textContent = open ? S.close : S.open;
    });
  });

  /* ---- order memo ---- */
  var memo = [], dlg = $("#memo"), list = $("[data-memo-items]");
  try { memo = JSON.parse(localStorage.getItem(STORE) || "[]"); if (!Array.isArray(memo)) memo = []; } catch (e) { memo = []; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(memo)); } catch (e) {} }
  function memoTotal() { return memo.reduce(function (sum, it) { return sum + it.total; }, 0); }
  function renderMemo() {
    list.textContent = "";
    memo.forEach(function (it, i) {
      var li = document.createElement("li"), b = document.createElement("b"), small = document.createElement("small"), rm = document.createElement("button");
      b.textContent = it.title; small.textContent = it.detail;
      rm.type = "button"; rm.textContent = S.remove;
      rm.addEventListener("click", function () { memo.splice(i, 1); save(); renderMemo(); });
      li.appendChild(b);
      if (D.showPrices) { var o = document.createElement("output"); o.textContent = tk(it.total); li.appendChild(o); }
      li.appendChild(small); li.appendChild(rm);
      list.appendChild(li);
    });
    $("[data-memo-empty]").hidden = memo.length > 0;
    var total = $("[data-memo-total]"); if (total) total.textContent = tk(memoTotal());
    $$("[data-memo-count]").forEach(function (el) { el.textContent = num(memo.length); });
    var wa = $("[data-memo-wa]");
    if (wa) wa.href = wa.href.split("?")[0] + "?text=" + encodeURIComponent(memoText());
  }
  function memoText() {
    var rows = [S.memoTitle + " · " + D.brand, S.memoName + ": " + ($("#memo-name").value.trim() || "—"), S.memoPhone + ": " + ($("#memo-phone").value.trim() || "—"), ""];
    memo.forEach(function (it, i) {
      rows.push(num(i + 1) + ". " + it.title + (D.showPrices ? " = " + tk(it.total) : ""));
      rows.push("   " + it.detail);
    });
    if (D.showPrices) rows.push("", S.memoTotal + ": " + tk(memoTotal()));
    return rows.join("\n");
  }
  var toastEl = $("[data-toast]"), toastTimer;
  function toast(text) {
    toastEl.hidden = true; void toastEl.offsetWidth;
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2800);
  }
  var ITEMS = { school: itemSchool, a4: itemA4, ring: itemRing };
  $$("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      memo.push(ITEMS[btn.dataset.add]()); save(); renderMemo(); toast(S.added);
      $$("[data-memo-count]").forEach(function (el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); });
    });
  });
  $$("[data-memo-open]").forEach(function (btn) { btn.addEventListener("click", function () { renderMemo(); dlg.showModal(); }); });
  $("[data-memo-close]").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   // click on the backdrop
  $("#memo-name").addEventListener("input", renderMemo);
  $("#memo-phone").addEventListener("input", renderMemo);
  $("[data-memo-clear]").addEventListener("click", function () { memo = []; save(); renderMemo(); toast(S.cleared); });
  $("[data-memo-copy]").addEventListener("click", function () {
    if (!memo.length) { toast(S.emptyWarn); return; }
    var text = memoText();
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { toast(S.copied); }, function () { toast(S.copyFail); });
  });
  var waBtn = $("[data-memo-wa]");
  if (waBtn) waBtn.addEventListener("click", function (e) { if (!memo.length) { e.preventDefault(); toast(S.emptyWarn); } });

  /* ---- header: mobile menu, language memory ---- */
  var menuBtn = $(".menu-toggle"), nav = $("#site-nav");
  menuBtn.addEventListener("click", function () {
    menuBtn.setAttribute("aria-expanded", nav.classList.toggle("open") ? "true" : "false");
  });
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });
  $$("[data-lang-switch]").forEach(function (a) {
    a.addEventListener("click", function () { try { localStorage.setItem("kh_lang", a.dataset.langSwitch); } catch (e) {} });
  });

  renderSchool(); renderA4(); renderRing(); renderMemo();
})();
