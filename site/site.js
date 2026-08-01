/* Perci site — small enhancements. The page is fully usable without this. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  /* --- Screenshot frames: if a file is absent, show the placeholder
         surface instead of a broken-image glyph --- */
  document.querySelectorAll(".shot-media img").forEach(function (img) {
    var markMissing = function () { img.parentElement.classList.add("missing"); };
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
