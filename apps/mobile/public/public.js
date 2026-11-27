// The one script of the public pages (landing, guides, legal, 404). They are complete without it: this only adds what plain
// HTML cannot do, as legacy did with a script. Loaded in <head>, not deferred, so the saved theme is on before the first paint;
// everything else waits for the document.
//   theme       the choice saved by the app (localStorage "pausa-theme") or by the landing's toggle, on every public page
//   landing     someone already signed in (not a Serata guest) goes on to /home; the Google button shows when Google is on
//               and the browser can use it; smooth scrolling (Lenis, /lenis.js, loaded here only); parallax and scroll
//               scrubbing on [data-speed], [data-speed-x], [data-scrub]
// Keep in step with src/theme (storage key, values) and src/features/embedded-browser.ts (in-app browsers).
(function () {
  "use strict";
  var KEY = "pausa-theme";
  var root = document.documentElement;
  var saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch (e) {}
  if (saved === "light" || saved === "dark" || saved === "system") root.setAttribute("data-theme", saved);

  function isLight() {
    var t = root.getAttribute("data-theme");
    return t === "light" || (t === "system" && matchMedia("(prefers-color-scheme: light)").matches);
  }

  function themeToggle() {
    var box = document.querySelector(".lp-theme");
    if (!box) return;
    box.checked = isLight();
    box.addEventListener("change", function () {
      var next = box.checked ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {}
    });
  }

  function getJson(url) {
    return fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) {
      return r.ok ? r.json() : null;
    });
  }

  function embedded(ua) {
    return (
      /FBAN|FBAV|FB_IAB|Instagram|Snapchat|MicroMessenger|TikTok|musical_ly|Bytedance|BytedanceWebview|LinkedInApp|\bLine\/|KAKAOTALK|Pinterest/i.test(ua) ||
      /; wv\)/.test(ua) ||
      (/(iPhone|iPad|iPod)/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua))
    );
  }

  function landing(page) {
    var locale = page.getAttribute("data-locale") || "it";
    // A visitor with a session does not need the shop window: on to their Cerchie. A Serata guest stays.
    getJson("/api/me")
      .then(function (me) {
        if (me && me.isAnonymous === false) location.replace("/" + locale + "/home");
      })
      .catch(function () {});
    var google = document.querySelector("[data-google]");
    if (google && !embedded(navigator.userAgent || "") && !("__TAURI_INTERNALS__" in window)) {
      getJson("/api/auth/google/status")
        .then(function (s) {
          if (s && s.enabled === true) google.hidden = false;
        })
        .catch(function () {});
    }
    motion();
  }

  // Each frame writes only transform and opacity, straight on the element, and reads only layout boxes. People who asked for
  // reduced motion keep a still page.
  function motion() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function all(sel) {
      return Array.prototype.slice.call(document.querySelectorAll(sel));
    }
    var layers = all("[data-speed]");
    var sideways = all("[data-speed-x]");
    var leaving = all('[data-scrub="leave"]');
    var arriving = all('[data-scrub="arrive"]');
    if (!layers.length && !sideways.length && !leaving.length && !arriving.length) return;
    function clamp(n) {
      return Math.min(1, Math.max(0, n));
    }
    function onScreen(r) {
      return r.bottom > -200 && r.top < innerHeight + 200;
    }
    var queued = false;
    function frame() {
      queued = false;
      var half = innerHeight / 2;
      var i, el, r, off;
      for (i = 0; i < layers.length; i++) {
        el = layers[i];
        r = el.parentElement && el.parentElement.getBoundingClientRect();
        if (!r || !onScreen(r)) continue;
        off = (r.top + r.height / 2 - half) * Number(el.getAttribute("data-speed"));
        el.style.transform = "translate3d(0," + (-off).toFixed(1) + "px,0)";
      }
      for (i = 0; i < sideways.length; i++) {
        el = sideways[i];
        r = el.parentElement && el.parentElement.getBoundingClientRect();
        if (!r || !onScreen(r)) continue;
        off = (r.top + r.height / 2 - half) * Number(el.getAttribute("data-speed-x"));
        el.style.transform = "translate3d(" + off.toFixed(1) + "px,0,0)";
      }
      var gone = clamp(scrollY / (innerHeight * 0.75));
      for (i = 0; i < leaving.length; i++) {
        leaving[i].style.opacity = (1 - gone * 0.85).toFixed(3);
        leaving[i].style.transform = "translate3d(0," + (-gone * 48).toFixed(1) + "px,0)";
      }
      for (i = 0; i < arriving.length; i++) {
        r = arriving[i].getBoundingClientRect();
        if (!onScreen(r)) continue;
        arriving[i].style.transform = "scale(" + (0.94 + clamp((innerHeight - r.top) / half) * 0.06).toFixed(4) + ")";
      }
    }
    function queue() {
      if (!queued) {
        queued = true;
        requestAnimationFrame(frame);
      }
    }
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    frame();
    smooth(queue);
  }

  // Lenis, as in legacy: the wheel glides instead of jumping, and the menu's #anchors glide under the sticky header. The page
  // scrolls natively until (and if) it has loaded.
  function smooth(onScroll) {
    var s = document.createElement("script");
    s.src = "/lenis.js";
    s.async = true;
    s.onload = function () {
      if (typeof window.Lenis !== "function") return;
      var lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.9, autoRaf: true });
      lenis.on("scroll", onScroll);
      document.addEventListener("click", function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        var id = a && a.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.getElementById(id.slice(1));
        if (!target) return;
        e.preventDefault();
        // Lenis already keeps the page's scroll-padding (the sticky header): it lands where the browser would.
        lenis.scrollTo(target, { duration: 1.1 });
        history.replaceState(null, "", id);
      });
    };
    document.head.appendChild(s);
  }

  function ready() {
    themeToggle();
    var page = document.querySelector("[data-landing]");
    if (page) landing(page);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
