"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Step = { title: string; body: string };

/**
 * Three steps. On wide screens the pictures sit in one sticky panel and cross-fade as each step scrolls to the
 * middle of the screen; on phones each step carries its own picture.
 */
export function HowItWorks({ title, steps, visuals }: { title: string; steps: Step[]; visuals: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5">
      <h2 data-reveal className="max-w-3xl font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.05]">{title}</h2>

      <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-20">
        <ol className="grid gap-14 lg:gap-0">
          {steps.map((s, i) => (
            <li
              key={s.title}
              data-step={i}
              ref={(el) => { items.current[i] = el; }}
              className="grid gap-5 lg:min-h-[72vh] lg:content-center"
            >
              <div data-reveal className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2">
                <span aria-hidden="true" className={`tabular font-display text-[3.4rem] leading-none transition-colors duration-500 ${active === i ? "text-accent" : "text-rule"}`}>{i + 1}</span>
                <div>
                  <h3 className="font-display text-[1.7rem] leading-tight">{s.title}</h3>
                  <p className="mt-2 max-w-md text-muted">{s.body}</p>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[340px] lg:hidden" data-reveal>{visuals[i]}</div>
            </li>
          ))}
        </ol>

        <div className="relative hidden lg:block">
          <div className="sticky top-28 h-[min(600px,72vh)]">
            {visuals.map((v, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`absolute inset-0 grid place-items-center transition-[opacity,transform] duration-500 ease-out ${active === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
              >
                <div className="w-full max-w-[340px]">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
