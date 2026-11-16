"use client";

import { useEffect, useState } from "react";

/** A bottom call-to-action bar on phones, shown once the hero has scrolled away and until the closing CTA is on screen. */
export function StickyCta({ label, href }: { label: string; href: string }) {
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    const end = document.getElementById("final");
    if (!hero || !end || !("IntersectionObserver" in window)) return;
    const a = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0 });
    const b = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting), { threshold: 0.1 });
    a.observe(hero);
    b.observe(end);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);

  const show = pastHero && !atEnd;
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/90 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-md transition-transform duration-300 ease-out md:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
    >
      <a href={href} tabIndex={show ? 0 : -1} className="grid min-h-12 place-items-center rounded-full bg-accent font-semibold text-on-accent">{label}</a>
    </div>
  );
}
