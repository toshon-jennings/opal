/* Perci site — small enhancements. The page is fully usable without this. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  /* --- Screenshot frames: if a file is absent, show the placeholder
         surface instead of a broken-image glyph --- */
  document.querySelectorAll(".shot-media img").forEach(function (img) {
    var markMissing = function () { img.classList.add("missing"); };
    img.addEventListener("error", markMissing);
    if (img.complete && img.naturalWidth === 0) markMissing();
  });

  /* --- Scroll reveals --- */
  var revealed = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(function (entries) {
      var seen = entries.filter(function (e) { return e.isIntersecting; });
      seen.forEach(function (entry, i) {
        var el = entry.target;
        io.unobserve(el);
        window.setTimeout(function () { el.classList.add("in"); }, i * 70);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("in"); });
  }

  /* --- Hero screenshot: swap between Perci's light and dark themes.
         Injected rather than authored so the control never appears
         without the JS that makes it work. --- */
  var themeSlot = document.querySelector("[data-theme-slot]");
  var themeMedia = themeSlot && themeSlot.closest(".shot").querySelector(".shot-media");
  if (themeSlot && themeMedia && themeMedia.querySelector(".shot-img.is-light")) {
    var group = document.createElement("div");
    group.className = "theme-toggle";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Screenshot theme");

    ["Dark", "Light"].forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      b.setAttribute("aria-pressed", String(name === "Dark"));
      b.addEventListener("click", function () {
        themeMedia.classList.toggle("show-light", name === "Light");
        group.querySelectorAll("button").forEach(function (other) {
          other.setAttribute("aria-pressed", String(other === b));
        });
      });
      group.appendChild(b);
    });

    themeSlot.appendChild(group);
  }

  /* --- Copy the install commands --- */
  var slot = document.querySelector("[data-copy-slot]");
  var code = document.querySelector(".term code");
  if (slot && code && navigator.clipboard) {
    var commands = code.textContent
      .split("\n")
      .map(function (line) { return line.replace(/^\$\s*/, ""); })
      .join("\n")
      .trim();

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.innerHTML =
      '<svg width="12" height="12" aria-hidden="true"><use href="#i-copy"/></svg>Copy';

    var resetTimer = null;
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(commands).then(function () {
        btn.classList.add("done");
        btn.innerHTML =
          '<svg width="12" height="12" aria-hidden="true"><use href="#i-check"/></svg>Copied';
        if (resetTimer) window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(function () {
          btn.classList.remove("done");
          btn.innerHTML =
            '<svg width="12" height="12" aria-hidden="true"><use href="#i-copy"/></svg>Copy';
        }, 1800);
      });
    });
    slot.appendChild(btn);
  }
})();
