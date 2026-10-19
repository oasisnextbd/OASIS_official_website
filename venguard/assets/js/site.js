/* VenGuard site behaviour: menu, language memory, click/scroll tracking,
 * campaign + dealer attribution, and the shared lead/pre-order form handler. */
(function () {
  "use strict";
  var CFG = window.VG_CONFIG || {};
  var track = function (n, p) { if (window.vgTrack) window.vgTrack(n, p); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- Attribution: campaign tags, dealer code / QR tag ---------- */
  var ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "dealer", "qr"];
  (function captureAttribution() {
    var q = new URLSearchParams(location.search);
    var found = false;
    ATTR_KEYS.forEach(function (k) { if (q.get(k)) { ss("vg_" + k, q.get(k).slice(0, 80)); found = true; } });
    if (!ss("vg_landing")) {
      ss("vg_landing", location.pathname + location.search);
      ss("vg_referrer", document.referrer ? new URL(document.referrer).hostname : "direct");
    }
    if (found) track("campaign_landing", { source: ss("vg_utm_source") || "", dealer_code: ss("vg_dealer") || "", qr_tag: ss("vg_qr") || "" });
  })();

  document.addEventListener("DOMContentLoaded", function () {
    /* ---------- Mobile menu ---------- */
    // Day / night theme switch (the choice is applied before paint in base.html)
    var root = document.documentElement, themeBtn = $("[data-theme-toggle]");
    function syncTheme() {
      if (!themeBtn) return;
      themeBtn.setAttribute("aria-pressed", root.getAttribute("data-theme") === "dark" ? "true" : "false");
    }
    if (themeBtn) themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      ls("vg_theme", next);
      syncTheme();
      track("theme_switch", { theme: next });
    });
    syncTheme();

    var toggle = $(".menu-toggle"), nav = $("#site-nav");
    if (toggle && nav) toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    /* ---------- Dropdown menus (chevron buttons; hover/focus opens them on wide screens via CSS) ---------- */
    var subToggles = $$(".sub-toggle");
    function closeSubs(except) {
      subToggles.forEach(function (b) {
        if (b === except) return;
        b.setAttribute("aria-expanded", "false");
        var m = document.getElementById(b.getAttribute("aria-controls"));
        if (m) m.classList.remove("is-open");
      });
    }
    subToggles.forEach(function (b) {
      b.addEventListener("click", function () {
        var m = document.getElementById(b.getAttribute("aria-controls"));
        var open = b.getAttribute("aria-expanded") !== "true";
        closeSubs(b);
        b.setAttribute("aria-expanded", open ? "true" : "false");
        if (m) m.classList.toggle("is-open", open);
      });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSubs(); });
    document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".has-sub")) closeSubs(); });
    // Following a section link inside the open mobile menu closes the menu.
    $$(".sub-menu a").forEach(function (a) {
      a.addEventListener("click", function () {
        closeSubs();
        if (nav && nav.classList.contains("is-open")) { nav.classList.remove("is-open"); if (toggle) toggle.setAttribute("aria-expanded", "false"); }
      });
    });

    /* ---------- Demo app: Android gets the APK; iPhone/iPad (which cannot install APKs) open the web app ---------- */
    var cfg = window.VG_CONFIG || {};
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
      $$("[data-app-link]").forEach(function (a) {
        if (cfg.app_web_url) { a.href = cfg.app_web_url + "#/welcome/" + (document.documentElement.lang === "bn" ? "bn" : "en"); a.removeAttribute("download"); }
      });
    }

    /* ---------- Language memory ---------- */
    $$("[data-lang-switch]").forEach(function (a) {
      a.addEventListener("click", function () {
        var l = a.getAttribute("data-lang-switch");
        ls("vg_lang", l);
        track("language_switch", { to: l });
      });
    });

    /* ---------- Click tracking: any element with data-track ---------- */
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-track]");
      if (!el) return;
      track(el.getAttribute("data-track"), { position: el.getAttribute("data-position") || "" });
    });

    /* ---------- Audience tabs ---------- */
    $$("[data-tabs]").forEach(function (box) {
      var tabs = $$("[role=tab]", box);
      function select(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(t); track("audience_tab", { tab: t.id }); });
        t.addEventListener("keydown", function (e) {
          var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
        });
      });
    });

    /* ---------- FAQ opens ---------- */
    $$("details[data-faq]").forEach(function (d) {
      d.addEventListener("toggle", function () { if (d.open) track("faq_open", { question_id: d.getAttribute("data-faq") }); });
    });

    /* ---------- Short silent clips: play only while on screen, and never on
       data-saver, slow connections or reduced-motion (then tap to play). ---------- */
    var conn = navigator.connection || {};
    var lite = conn.saveData || /(^|-)2g$|^3g$/.test(conn.effectiveType || "") ||
      (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    $$("video[data-inview-play]").forEach(function (v) {
      var fig = v.closest(".gallery-item");
      var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); if (fig) fig.classList.add("is-playing"); };
      var btn = fig && $(".gallery-play", fig);
      if (btn) btn.addEventListener("click", play);
      if (lite || !("IntersectionObserver" in window)) return;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) play(); else { v.pause(); if (fig) fig.classList.remove("is-playing"); } });
      }, { threshold: 0.6 }).observe(v);
    });

    /* ---------- Video plays ---------- */
    $$("video").forEach(function (v) {
      v.addEventListener("play", function () { track("video_play", { video: v.getAttribute("data-name") || v.currentSrc.split("/").pop() }); }, { once: true });
    });

    /* ---------- Scroll depth (25/50/75/100) ---------- */
    var marks = [25, 50, 75, 100], sent = {};
    var onScroll = function () {
      var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? Math.round((h.scrollTop / max) * 100) : 100;
      marks.forEach(function (m) { if (pct >= m && !sent[m]) { sent[m] = 1; track("scroll_depth", { percent: m }); } });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    /* ---------- Funnel step: how-it-works read ---------- */
    if (document.body.getAttribute("data-page") === "how-it-works") track("funnel_how_it_works");

    applyLiveSettings();
    $$("form[data-vg-form]").forEach(setupForm);
    setupOrderSummary();
    setupThankYou();
    setupRatings();
  });

  /* ================= Live settings from the team dashboard =================
     Pre-order on/off, kit price and a notice bar. Cached for 10 minutes so
     pages stay fast; the static page is always complete without it. */
  function applyLiveSettings() {
    var url = CFG.endpoints && CFG.endpoints.leads, fb = CFG.firebase || {};
    if (!fb.project_id && !url) return;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem("vg_settings") || "null"); } catch (e) {}
    if (cached && Date.now() - cached.t < 6e5) return apply(cached.s);
    // settings/website in the dashboard's database (or the older Apps Script endpoint).
    var get = fb.project_id
      ? fetch(fsUrl("settings/website")).then(function (r) { return r.ok ? r.json() : { fields: {} }; }).then(function (j) {
          var o = { ok: true }, f = j.fields || {};
          Object.keys(f).forEach(function (k) { o[k] = fsValue(f[k]); });
          return o;
        })
      : fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "settings=1").then(function (r) { return r.json(); });
    get.then(function (s) {
      try { sessionStorage.setItem("vg_settings", JSON.stringify({ t: Date.now(), s: s })); } catch (e) {}
      apply(s);
    }).catch(function () {});
    function apply(s) {
      if (!s || !s.ok) return;
      var lang = document.documentElement.lang;
      if (String(s.preorder_open).toLowerCase() === "false") {
        var contact = ($(".nav a[href$='about/']") || {}).href ? $(".nav a[href$='about/']").href.replace(/about\/$/, "contact/") : "contact/";
        $$("[data-track='cta_preorder_click']").forEach(function (a) {
          a.textContent = lang === "bn" ? "আপডেট পেতে যোগাযোগ করুন" : "Get notified";
          a.setAttribute("href", contact); a.setAttribute("data-track", "cta_waitlist_click");
        });
        var form = $("form[data-vg-form='preorder']");
        if (form) form.outerHTML = '<div class="notice"><p class="mt-0">' + (lang === "bn" ? "প্রি-অর্ডার এই মুহূর্তে বন্ধ আছে। আপডেট পেতে যোগাযোগ করুন।" : "Pre-orders are paused right now. Contact us to be notified.") + ' <a href="' + contact + '">' + (lang === "bn" ? "যোগাযোগ" : "Contact") + "</a></p></div>";
      }
      var price = parseInt(s.kit_price_bdt, 10);
      if (price > 0) $$("[data-setting='kit_price']").forEach(function (el) {
        el.textContent = lang === "bn" ? "৳" + String(price.toLocaleString("en-US")).replace(/[0-9]/g, function (d) { return "০১২৩৪৫৬৭৮৯"[d]; }) : "BDT " + price.toLocaleString("en-US");
      });
      var note = lang === "bn" ? s.notice_bn : s.notice_en;
      if (note) {
        var bar = document.createElement("div");
        bar.className = "site-notice"; bar.setAttribute("role", "status");
        bar.innerHTML = '<div class="wrap"></div>'; bar.firstChild.textContent = note;
        var header = $(".site-header"); if (header) header.parentNode.insertBefore(bar, header.nextSibling);
      }
    }
  }

  /* ================= Forms ================= */
  var BN = "০১২৩৪৫৬৭৮৯";
  function toAscii(s) { return String(s || "").replace(/[০-৯]/g, function (d) { return BN.indexOf(d); }); }
  function normalisePhone(v) {
    var d = toAscii(v).replace(/[^\d+]/g, "");
    d = d.replace(/^\+?880/, "0").replace(/^\+?88(?=01)/, "");
    return d;
  }
  var VALIDATORS = {
    "bd-mobile": function (v) { return /^01[3-9]\d{8}$/.test(normalisePhone(v)); },
    "email": function (v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); },
    "units": function (v) { var n = parseInt(toAscii(v), 10); return n >= 1 && n <= 9999; },
    "units-optional": function (v) { if (!v) return true; var n = parseInt(toAscii(v), 10); return n >= 0 && n <= 99999; }
  };

  function orderId() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "VG-" + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + "-" + rnd;
  }

  function fieldBox(el) { return el.closest(".field"); }
  function setError(el, msg) {
    var box = fieldBox(el); if (!box) return;
    var err = $(".field-error", box);
    box.classList.toggle("has-error", !!msg);
    if (err) err.textContent = msg || "";
    $$("input,select,textarea", box).forEach(function (i) { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); });
  }
  function validateField(el) {
    var box = fieldBox(el); if (!box) return true;
    var err = $(".field-error", box);
    var val = el.type === "checkbox" ? (el.checked ? "yes" : "") : el.type === "radio" ? ($("input[name='" + el.name + "']:checked", box) || {}).value || "" : el.value.trim();
    if (el.required && !val) { setError(el, err && err.getAttribute("data-msg-required")); return false; }
    var rule = el.getAttribute("data-validate");
    if (rule && val && VALIDATORS[rule] && !VALIDATORS[rule](val)) { setError(el, el.getAttribute("data-msg-invalid")); return false; }
    setError(el, "");
    return true;
  }

  /* ================= Firestore (team dashboard database) =================
     Plain REST calls, no SDK. firestore.rules lets a visitor create an order and read one active
     promo code or the public website settings, nothing else. */
  function fsUrl(path, query) {
    var fb = CFG.firebase || {};
    return "https://firestore.googleapis.com/v1/projects/" + fb.project_id + "/databases/(default)/documents/" + path + "?" + (query ? query + "&" : "") + "key=" + encodeURIComponent(fb.api_key || "");
  }
  function fsValue(x) {
    x = x || {};
    return "stringValue" in x ? x.stringValue : "integerValue" in x ? Number(x.integerValue) : "doubleValue" in x ? x.doubleValue : "booleanValue" in x ? x.booleanValue : undefined;
  }

  /* ================= Star ratings (footer) =================
     Up to three 1–5 star ratings (the device, the website, the service), saved on each tap: no form,
     no name or phone. One ratings/<id> document per browser: the random id is kept in localStorage,
     so a visitor can change their stars and the team dashboard (→ Ratings) counts them once.
     firestore.rules lets a visitor write that document (exactly these fields) but never read it. */
  var RATE_KEYS = ["product", "website", "service"];
  function setupRatings() {
    var box = $("[data-rate]"), fb = CFG.firebase || {};
    if (!box) return;
    if (!fb.project_id) { box.hidden = true; return; }
    var mine = {}, msg = $(".rate-msg", box);
    try { mine = JSON.parse(ls("vg_rating") || "{}") || {}; } catch (e) {}
    function paint() {
      $$("[data-rate-key]", box).forEach(function (g) {
        var v = mine[g.getAttribute("data-rate-key")] || 0;
        $$("[data-star]", g).forEach(function (b) {
          var n = Number(b.getAttribute("data-star"));
          b.classList.toggle("is-on", n <= v);
          b.setAttribute("aria-pressed", n === v ? "true" : "false");
        });
      });
    }
    function save() {
      var now = new Date().toISOString();
      if (!mine.id) { mine.id = "R-" + randomId(20); mine.created_at = now; }
      var f = { source: { stringValue: "website" }, created_at: { stringValue: mine.created_at }, updated_at: { stringValue: now },
        lang: { stringValue: document.documentElement.lang === "bn" ? "bn" : "en" }, page: { stringValue: location.pathname.slice(0, 120) } };
      RATE_KEYS.forEach(function (k) { if (mine[k]) f[k] = { integerValue: String(mine[k]) }; });
      ls("vg_rating", JSON.stringify(mine));
      // PATCH without a field mask writes the whole document: creates it the first time, replaces it after.
      return fetch(fsUrl("ratings/" + mine.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: f }) })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
    }
    paint();
    box.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-star]");
      if (!b) return;
      var key = b.parentNode.getAttribute("data-rate-key"), n = Number(b.getAttribute("data-star"));
      if (RATE_KEYS.indexOf(key) < 0) return;
      mine[key] = n;
      paint();
      msg.textContent = "";
      save().then(function () {
        msg.textContent = box.getAttribute("data-msg-ok");
        track("rating_given", { rating_for: key, stars: n });
      }).catch(function () { msg.textContent = box.getAttribute("data-msg-fail"); });
    });
  }
  function randomId(n) {
    var abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", out = "", buf = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < n; i++) out += abc[buf[i] % abc.length];
    return out;
  }

  /* ================= Promo codes =================
     Checks one code against the team dashboard's list (Firestore lets anyone read an ACTIVE code by
     its exact name, never the list). The discount itself is applied by the team on the invoice. */
  var promoCache = {};
  function promoCode(v) { return toAscii(v).toUpperCase().replace(/[^A-Z0-9-]/g, ""); }
  function checkPromo(raw) {
    var code = promoCode(raw), pc = CFG.firebase || {};
    if (!code || !pc.project_id) return Promise.resolve({ code: code, ok: true, unchecked: true });
    if (promoCache[code]) return promoCache[code];
    promoCache[code] = fetch(fsUrl("promos/" + encodeURIComponent(code))).then(function (r) {
      if (!r.ok) return { code: code, ok: false, reason: "unknown" };   // 403 or 404: no active code by that name
      return r.json().then(function (j) {
        var f = j.fields || {};
        var v = function (k) { return fsValue(f[k]); };
        var today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10);   // Dhaka date
        if (v("active") !== true) return { code: code, ok: false, reason: "unknown" };
        if (v("starts") && today < v("starts")) return { code: code, ok: false, reason: "not_started" };
        if (v("ends") && today > v("ends")) return { code: code, ok: false, reason: "ended" };
        if (v("max_uses") && (v("used") || 0) >= v("max_uses")) return { code: code, ok: false, reason: "used_up" };
        return { code: code, ok: true, type: v("type"), value: v("value") };
      });
    }).catch(function () { delete promoCache[code]; return { code: code, ok: true, unchecked: true }; });   // offline: the team checks it later
    return promoCache[code];
  }
  function showPromo(el, r) {
    var bn = document.documentElement.lang === "bn", box = fieldBox(el);
    var note = $(".field-note", box);
    if (!note) { note = document.createElement("span"); note.className = "field-note"; note.setAttribute("aria-live", "polite"); box.appendChild(note); }
    note.textContent = "";
    if (!r || !r.code) return setError(el, "");
    if (!r.ok) {
      var why = { unknown: ["এই কোডটি সঠিক নয় বা আর চালু নেই।", "This code isn't valid or is no longer running."],
        not_started: ["এই কোডটি এখনো চালু হয়নি।", "This code hasn't started yet."], ended: ["এই কোডের মেয়াদ শেষ।", "This code has ended."],
        used_up: ["এই কোডটি সর্বোচ্চ সংখ্যকবার ব্যবহার হয়ে গেছে।", "This code has been used up."] }[r.reason] || ["", ""];
      return setError(el, why[bn ? 0 : 1] + (bn ? " ঠিক করুন বা মুছে দিন।" : " Check it or remove it."));
    }
    setError(el, "");
    if (r.unchecked) return;
    var n = Number(r.value) || 0;
    var off = r.type === "percent" ? (bn ? toBn(n) + "% ছাড়" : n + "% off") : (bn ? "৳" + toBn(n.toLocaleString("en-US")) + " ছাড়" : "BDT " + n.toLocaleString("en-US") + " off");
    note.textContent = bn ? "কোড " + r.code + ": কিটের দামে " + off + "। ছাড় আপনার ইনভয়েসে যোগ হবে।" : "Code " + r.code + ": " + off + " the kit price, applied on your invoice.";
  }
  function toBn(s) { return String(s).replace(/\d/g, function (d) { return BN[d]; }); }

  function setupForm(form) {
    var type = form.getAttribute("data-vg-form");
    var started = false, submitted = false, lastField = "";
    var draftKey = "vg_draft_" + type;

    // Fill hidden attribution fields.
    var set = function (n, v) { var i = form.elements[n]; if (i && v) i.value = v; };
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (k) { set(k, ss("vg_" + k)); });
    set("qr_tag", ss("vg_qr"));
    set("landing_page", ss("vg_landing"));
    set("referrer", ss("vg_referrer"));
    set("lang", document.documentElement.lang);
    if (form.elements.dealer_code && ss("vg_dealer") && !form.elements.dealer_code.value) form.elements.dealer_code.value = ss("vg_dealer");

    // Restore a draft the visitor didn't finish (kept only in their own browser).
    try {
      var draft = JSON.parse(ls(draftKey) || "null");
      if (draft) Object.keys(draft).forEach(function (k) {
        var el = form.elements[k]; if (!el || el.type === "hidden") return;
        if (el.length && el[0] && el[0].type === "radio") { $$("input[name='" + k + "']", form).forEach(function (r) { r.checked = r.value === draft[k]; }); }
        else if (el.type !== "checkbox") el.value = draft[k];
      });
    } catch (e) {}

    // A package chosen on a pricing card (?package=…) wins over a saved draft.
    var wantPkg = new URLSearchParams(location.search).get("package");
    if (wantPkg) $$("input[name='package']", form).forEach(function (r) { if (r.value === wantPkg) r.checked = true; });

    form.addEventListener("focusin", function (e) {
      if (!started) {
        started = true;
        track("form_start", { form: type });
        if (type === "preorder") track("form_start_preorder", { form: type });
      }
      if (e.target.name) lastField = e.target.name;
    });
    form.addEventListener("change", function (e) {
      if (e.target.name) validateField(e.target);
      if (e.target.name === "promo_code") checkPromo(e.target.value).then(function (r) { showPromo(e.target, r); });
      saveDraft();
    });
    form.addEventListener("focusout", function (e) {
      var el = e.target;
      if (el.name && el.type !== "radio" && (el.value || fieldBox(el) && fieldBox(el).classList.contains("has-error"))) validateField(el);
    });
    // Where do people stop? Report the last field touched if they leave without submitting.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && started && !submitted) track("form_abandon", { form: type, last_field: lastField });
    });

    function saveDraft() {
      var data = {};
      $$("input,select,textarea", form).forEach(function (el) {
        if (!el.name || el.type === "hidden" || el.name === "website" || el.type === "checkbox") return;
        if (el.type === "radio") { if (el.checked) data[el.name] = el.value; } else if (el.value) data[el.name] = el.value;
      });
      ls(draftKey, JSON.stringify(data));
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $(".form-status", form), btn = $("button[type=submit]", form);
      var ok = true, firstBad = null;
      $$("input,select,textarea", form).forEach(function (el) {
        if (!el.name || el.type === "hidden") return;
        if (!validateField(el)) { ok = false; if (!firstBad) firstBad = el; track("form_error", { form: type, field: el.name }); }
      });
      if (!ok) {
        status.textContent = form.getAttribute("data-msg-check");
        status.classList.add("is-visible");
        firstBad.focus();
        return;
      }
      if (form.elements.website && form.elements.website.value) return; // spam honeypot

      // A promo code must be a running one before the order goes out.
      var promoEl = form.elements.promo_code;
      if (promoEl && promoEl.value.trim()) {
        btn.disabled = true;
        return checkPromo(promoEl.value).then(function (r) {
          btn.disabled = false;
          showPromo(promoEl, r);
          if (!r.ok) { track("form_error", { form: type, field: "promo_code" }); promoEl.focus(); return; }
          promoEl.value = r.code;
          send();
        });
      }
      send();
    });

    function send() {
      var status = $(".form-status", form), btn = $("button[type=submit]", form);
      var data = {};
      $$("input,select,textarea", form).forEach(function (el) {
        if (!el.name || el.name === "website") return;
        if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
        data[el.name] = el.value.trim();
      });
      data.phone = normalisePhone(data.phone);
      if (data.units) data.units = toAscii(data.units);
      data.form_type = type;
      data.order_id = orderId();
      data.status = type === "preorder" ? "payment_pending" : "new";
      data.submitted_at = new Date().toISOString();
      data.page_url = location.pathname;

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = btn.getAttribute("data-label-busy");
      submitted = true;

      sendLead(data).then(function (res) {
        try { localStorage.removeItem(draftKey); } catch (e2) {}
        // Analytics gets the type and position only — never the person's details.
        track("lead_submit", { form: type, package: data.package || "", kitchen_type: data.kitchen_type || "", units_band: band(data.units), has_dealer_code: !!data.dealer_code, has_promo_code: !!data.promo_code });
        if (type === "preorder") {
          var id = (res && res.order_id) || data.order_id;
          ss("vg_last_order", id);
          var payUrl = res && res.payment_url;
          if (CFG.endpoints && CFG.endpoints.payment_enabled && payUrl) {
            track("payment_start", { form: type });
            location.href = payUrl;
            return;
          }
          location.href = form.getAttribute("data-next") + "?order=" + encodeURIComponent(id) + "&payment=pending" + (res && res.handoff ? "&send=1" : "");
          return;
        }
        form.reset();
        if (res && res.handoff) {
          status.textContent = "";
          status.appendChild(handOff(ss("vg_handoff") || "", type));
        } else status.textContent = form.getAttribute("data-msg-ok");
        status.classList.add("is-visible");
        btn.disabled = false; btn.textContent = label;
      }).catch(function () {
        submitted = false;
        track("lead_submit_error", { form: type });
        status.textContent = form.getAttribute("data-msg-fail");
        status.classList.add("is-visible");
        btn.disabled = false; btn.textContent = label;
      });
    }
  }

  function band(n) { n = parseInt(n, 10) || 0; return n <= 1 ? "1" : n <= 5 ? "2-5" : n <= 20 ? "6-20" : "21+"; }

  /* Save the lead to OUR database first (status payment_pending), so a failed
     or abandoned payment never loses it (brief Part 6). */
  function sendLead(data) {
    var url = CFG.endpoints && CFG.endpoints.leads;
    // Saved straight into the team dashboard. If that fails (no internet, database down), the visitor
    // sends the details on WhatsApp or email instead, so no order is ever lost. See handOff().
    if ((CFG.firebase || {}).project_id) return saveOrder(data).catch(function () { track("lead_save_fallback", { form: data.form_type }); return handoffResult(data); });
    if (!url) return Promise.resolve(handoffResult(data));
    // text/plain avoids a CORS preflight, which Google Apps Script cannot answer.
    return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { if (!j || j.ok === false) throw new Error("rejected"); return j; });
  }

  // Exactly the fields firestore.rules (websiteOrder) accepts; everything is text.
  var ORDER_FIELDS = ["order_id", "form_type", "status", "submitted_at", "name", "phone", "email", "organisation", "area", "district", "kitchen_type",
    "business_type", "units", "cylinder_brand", "heard_from", "dealer_code", "promo_code", "package", "message", "consent", "lang", "page_url",
    "landing_page", "referrer", "qr_tag", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
  function saveOrder(data, retried) {
    var fields = { source: { stringValue: "website" } };
    ORDER_FIELDS.forEach(function (k) {
      if (data[k] != null && data[k] !== "") fields[k] = { stringValue: String(data[k]).slice(0, k === "message" ? 2000 : k === "name" ? 120 : 100) };
    });
    return fetch(fsUrl("orders", "documentId=" + encodeURIComponent(data.order_id)), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: fields })
    }).then(function (r) {
      if (r.status === 409 && !retried) { data.order_id = orderId(); return saveOrder(data, true); }   // same number already taken
      if (!r.ok) throw new Error("HTTP " + r.status);
      return { ok: true, order_id: data.order_id };
    });
  }
  function handoffResult(data) {
    ss("vg_handoff", leadMessage(data));
    return { ok: true, order_id: data.order_id, handoff: true };
  }

  /* ================= Hand-off when the order can't be saved =================
     Builds a plain-text summary of the form and offers it on WhatsApp (prefilled) and by email.
     Only used when saving fails (or no database is set); the visitor taps Send, so nothing is sent silently. */
  var LABELS = {
    en: { preorder: "VenGuard pre-order", enquiry: "VenGuard enquiry", dealer: "VenGuard dealer application", waitlist: "VenGuard waitlist", contact: "VenGuard message",
      order_id: "Order", ref: "Reference", name: "Name", phone: "Phone", email: "Email", organisation: "Organisation", area: "Area", district: "District", package: "Package",
      kitchen_type: "Kitchen", business_type: "Business", units: "Units", cylinder_brand: "Cylinder", dealer_code: "Dealer code", promo_code: "Promo code", message: "Message" },
    bn: { preorder: "VenGuard প্রি-অর্ডার", enquiry: "VenGuard অনুসন্ধান", dealer: "VenGuard ডিলার আবেদন", waitlist: "VenGuard অপেক্ষা তালিকা", contact: "VenGuard বার্তা",
      order_id: "অর্ডার", ref: "রেফারেন্স", name: "নাম", phone: "ফোন", email: "ইমেইল", organisation: "প্রতিষ্ঠান", area: "এলাকা", district: "জেলা", package: "প্যাকেজ",
      kitchen_type: "রান্নাঘর", business_type: "ব্যবসা", units: "ইউনিট", cylinder_brand: "সিলিন্ডার", dealer_code: "ডিলার কোড", promo_code: "প্রোমো কোড", message: "বার্তা" }
  };
  function leadMessage(d) {
    var L = LABELS[document.documentElement.lang === "bn" ? "bn" : "en"];
    var lines = [L[d.form_type] || L.contact];
    ["order_id", "name", "phone", "email", "organisation", "area", "district", "package", "kitchen_type", "business_type", "units", "cylinder_brand", "dealer_code", "promo_code", "message"].forEach(function (k) {
      if (d[k]) lines.push((k === "order_id" && d.form_type !== "preorder" ? L.ref : L[k]) + ": " + d[k]);
    });
    return lines.join("\n");
  }
  function handOff(msg, type) {
    var bn = document.documentElement.lang === "bn";
    var box = document.createElement("div");
    box.className = "handoff";
    var p = document.createElement("p");
    p.innerHTML = bn ? "<strong>আর একটি ধাপ:</strong> নিচের বোতামে চাপ দিয়ে আপনার তথ্য WhatsApp-এ আমাদের পাঠান। বার্তাটি তৈরি করা আছে, শুধু Send চাপুন।"
                     : "<strong>One more step:</strong> tap the button to send your details to us on WhatsApp. The message is ready, just press Send.";
    box.appendChild(p);
    var row = document.createElement("p"); row.className = "btn-row";
    if (CFG.whatsapp_number) {
      var wa = document.createElement("a");
      wa.className = "btn btn--primary"; wa.target = "_blank"; wa.rel = "noopener";
      wa.href = "https://wa.me/" + CFG.whatsapp_number + "?text=" + encodeURIComponent(msg);
      wa.textContent = bn ? "WhatsApp-এ পাঠান" : "Send on WhatsApp";
      wa.addEventListener("click", function () { track("lead_handoff", { form: type, channel: "whatsapp" }); });
      row.appendChild(wa);
    }
    if (CFG.email) {
      var em = document.createElement("a");
      em.className = "btn btn--secondary";
      em.href = "mailto:" + CFG.email + "?subject=" + encodeURIComponent(msg.split("\n")[0]) + "&body=" + encodeURIComponent(msg);
      em.textContent = bn ? "ইমেইলে পাঠান" : "Send by email";
      em.addEventListener("click", function () { track("lead_handoff", { form: type, channel: "email" }); });
      row.appendChild(em);
    }
    box.appendChild(row);
    return box;
  }

  /* ================= Pre-order summary card =================
     Shows the chosen package × units, the deposit and what is left to pay at delivery. */
  function setupOrderSummary() {
    var card = $("[data-order-summary]"), form = $("form[data-vg-form='preorder']");
    if (!card || !form) return;
    var prices = {}, names = {};
    try { prices = JSON.parse(card.getAttribute("data-prices")); names = JSON.parse(card.getAttribute("data-names")); } catch (e) { return; }
    var deposit = parseInt(card.getAttribute("data-deposit"), 10) || 0, bn = card.getAttribute("data-lang") === "bn";
    var money = function (n) { var s = Math.max(0, n).toLocaleString("en-US"); return bn ? "৳" + toBn(s) : "BDT " + s; };
    function update() {
      var pkg = ($("input[name='package']:checked", form) || {}).value || "complete";
      var units = Math.min(999, Math.max(1, parseInt(toAscii((form.elements.units || {}).value), 10) || 1));
      var total = (prices[pkg] || 0) * units;
      $("[data-sum-name]", card).textContent = names[pkg] || "";
      $("[data-sum-units]", card).textContent = units > 1 ? "× " + (bn ? toBn(units) : units) : "";
      $("[data-sum-total]", card).textContent = money(total);
      $("[data-sum-rest]", card).textContent = money(total - deposit);
    }
    form.addEventListener("change", update);
    form.addEventListener("input", function (e) { if (e.target.name === "units") update(); });
    update();
  }

  /* ================= Thank-you page ================= */
  function setupThankYou() {
    var box = $("[data-thank-you]"); if (!box) return;
    var q = new URLSearchParams(location.search);
    var id = q.get("order") || ss("vg_last_order") || "—";
    var state = q.get("payment") || "pending"; // paid | pending | failed (set by the payment callback)
    if (["paid", "pending", "failed"].indexOf(state) < 0) state = "pending";
    $$("[data-order-id]").forEach(function (el) { el.textContent = id; });
    var slot = $("[data-handoff]", box), msg = ss("vg_handoff");
    if (slot && q.get("send") === "1" && msg) {
      slot.appendChild(handOff(msg, "preorder")); slot.hidden = false;
      var h = $("h1[data-state='pending']", box);
      if (h) h.textContent = document.documentElement.lang === "bn" ? "প্রায় শেষ! অর্ডারটি আমাদের পাঠান।" : "Almost done! Send us your order.";
    }
    $$("[data-state]", box).forEach(function (el) { el.hidden = el.getAttribute("data-state") !== state; });
    if (state === "paid") track("deposit_paid", { value: CFG.deposit_bdt || 500, currency: "BDT" });
    else if (state === "failed") track("payment_fail", {});
    else track("preorder_submitted_unpaid", {});
  }
})();

/* Home page: previous / next buttons of the achievements row. */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var row = document.getElementById("ach-row");
    function step(dir) {
      if (!row) return;
      var card = row.querySelector("li");
      var by = card ? card.getBoundingClientRect().width + 16 : row.clientWidth * 0.8;
      row.scrollBy({ left: dir * by, behavior: "smooth" });
    }
    var prev = document.querySelector("[data-carousel-prev]"), next = document.querySelector("[data-carousel-next]");
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
  });
})();

/* System animation (partials/system-animation.html): the step being read sets the scene's
 * data-step; the Play button steps through 1–5 on its own (for demos and small screens). */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-sys]");
    if (!root) return;
    var scene = root.querySelector("[data-sys-scene]");
    var steps = root.querySelectorAll("[data-sys-step]");
    var dots = root.querySelectorAll("[data-sys-goto]");
    var playBtn = root.querySelector("[data-sys-play]");
    var label = root.querySelector("[data-sys-play-label]");
    var timer = null, current = 0;
    function show(n) {
      current = n;
      scene.setAttribute("data-step", String(n));
      Array.prototype.forEach.call(steps, function (li) { li.classList.toggle("is-active", li.getAttribute("data-sys-step") === String(n)); });
      Array.prototype.forEach.call(dots, function (d) { if (d.getAttribute("data-sys-goto") === String(n)) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current"); });
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer); timer = null;
      playBtn.setAttribute("aria-pressed", "false");
      label.textContent = label.getAttribute("data-play");
    }
    function play() {
      playBtn.setAttribute("aria-pressed", "true");
      label.textContent = label.getAttribute("data-pause");
      show(current >= 5 || current < 1 ? 1 : current + 1);
      timer = setInterval(function () { show(current >= 5 ? 1 : current + 1); }, 3200);
    }
    if (playBtn) playBtn.addEventListener("click", function () { if (timer) stop(); else play(); });
    Array.prototype.forEach.call(dots, function (d) { d.addEventListener("click", function () { stop(); show(Number(d.getAttribute("data-sys-goto"))); }); });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (timer) return;
        entries.forEach(function (e) { if (e.isIntersecting) show(Number(e.target.getAttribute("data-sys-step"))); });
      }, { rootMargin: "-50% 0px -40% 0px" });
      Array.prototype.forEach.call(steps, function (li) { io.observe(li); });
    } else { show(1); }
  });
})();
