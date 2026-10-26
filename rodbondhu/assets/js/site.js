/* Rod Bondhu website: mobile menu and language memory (key rb_lang, shared with the live app). */
(function () {
  var btn = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  if (btn && nav) {
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { nav.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); }
    });
  }
  document.querySelectorAll("[data-lang-switch]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("rb_lang", a.getAttribute("data-lang-switch")); } catch (e) {}
    });
  });
})();
