"use client";

import { useEffect } from "react";

/**
 * Fades sections in as they scroll into view. Elements opt in with `data-reveal` (and an optional `--d` delay).
 * The hidden state only exists once this runs, so without JavaScript (or with reduced motion) everything is simply visible.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    // The hidden state is scoped to `.js .reveal-ready` in globals.css: both classes land together, only once a script runs.
    document.documentElement.classList.add("js", "reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("reveal-ready");
      els.forEach((el) => el.classList.remove("is-in"));
    };
  }, []);
  return null;
}
