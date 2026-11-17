"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth scrolling (Lenis) and the scroll-linked motion of the landing page. Every effect writes only `transform` or
 * `opacity`, straight to the element (no React re-render on scroll), and reads its numbers from Lenis on each frame:
 * - `data-speed="0.1"`: parallax. The element drifts vertically against the scroll, measured from its parent.
 * - `data-speed-x="0.1"`: the same drift, sideways (the footer wordmark slides in as the page ends).
 * - `data-progress`: a bar scaled on X by how far down the page the reader is.
 * - `data-scrub="leave"`: fades and lifts as its section scrolls out at the top (the hero text).
 * - `data-scrub="arrive"`: grows from 94% to full size while it crosses the lower half of the screen (a closing head).
 * - `#anchor` links scroll smoothly, under the sticky header.
 * Does nothing for people who asked for reduced motion: they keep native scrolling and static layers.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, autoRaf: true });
    const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
    const layers = all("[data-speed]");
    const sideways = all("[data-speed-x]");
    const bars = all("[data-progress]");
    const leaving = all('[data-scrub="leave"]');
    const arriving = all('[data-scrub="arrive"]');
    const touched = [...layers, ...sideways, ...bars, ...leaving, ...arriving];
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const onScreen = (r: DOMRect) => r.bottom > -200 && r.top < innerHeight + 200;

    const frame = () => {
      const half = innerHeight / 2;
      for (const el of layers) {
        const r = el.parentElement?.getBoundingClientRect();
        if (!r || !onScreen(r)) continue;
        const offset = (r.top + r.height / 2 - half) * Number(el.dataset.speed ?? 0);
        el.style.transform = `translate3d(0, ${(-offset).toFixed(1)}px, 0)`;
      }
      for (const el of sideways) {
        const r = el.parentElement?.getBoundingClientRect();
        if (!r || !onScreen(r)) continue;
        const offset = (r.top + r.height / 2 - half) * Number(el.dataset.speedX ?? 0);
        el.style.transform = `translate3d(${offset.toFixed(1)}px, 0, 0)`;
      }
      for (const el of bars) el.style.transform = `scaleX(${clamp(lenis.progress).toFixed(4)})`;
      for (const el of leaving) {
        const gone = clamp(lenis.scroll / (innerHeight * 0.75));
        el.style.opacity = (1 - gone * 0.85).toFixed(3);
        el.style.transform = `translate3d(0, ${(-gone * 48).toFixed(1)}px, 0)`;
      }
      for (const el of arriving) {
        const r = el.getBoundingClientRect();
        if (!onScreen(r)) continue;
        const seen = clamp((innerHeight - r.top) / half);
        el.style.transform = `scale(${(0.94 + seen * 0.06).toFixed(4)})`;
      }
    };
    lenis.on("scroll", frame);
    frame();

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
      for (const el of touched) { el.style.transform = ""; el.style.opacity = ""; }
    };
  }, []);

  return null;
}
