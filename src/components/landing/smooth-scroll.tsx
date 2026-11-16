"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth scrolling (Lenis) and a light parallax for the landing page.
 * - Parallax: elements with `data-speed="0.1"` drift against the scroll, measured from their (untransformed) parent.
 *   Only `transform` is written, straight to the element: no React re-renders on scroll.
 * - `#anchor` links scroll smoothly, under the sticky header.
 * Does nothing for people who asked for reduced motion: they keep native scrolling and static layers.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, autoRaf: true });
    const layers = [...document.querySelectorAll<HTMLElement>("[data-speed]")];

    const parallax = () => {
      const half = innerHeight / 2;
      for (const el of layers) {
        const parent = el.parentElement;
        if (!parent) continue;
        const r = parent.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) continue; // off screen: skip the work
        const offset = (r.top + r.height / 2 - half) * Number(el.dataset.speed ?? 0);
        el.style.transform = `translate3d(0, ${(-offset).toFixed(1)}px, 0)`;
      }
    };
    lenis.on("scroll", parallax);
    parallax();

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      const id = a?.getAttribute("href");
      if (!a || !id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -72, duration: 1.1 });
      history.replaceState(null, "", id);
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      lenis.destroy();
      for (const el of layers) el.style.transform = "";
    };
  }, []);

  return null;
}
