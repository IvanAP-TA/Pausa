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
    <div className="mx-auto w-full max-w-[var(--container)] px-[var(--gutter)]">
      <h2 data-reveal className="max-w-[60rem] font-display text-poster font-extralight leading-[1.02] text-balance">{title}</h2>

      <div className="mt-12 grid gap-x-[var(--gap-columns)] gap-y-10 lg:mt-4 lg:grid-cols-12">
        <ol className="grid gap-14 lg:col-span-7 lg:gap-0">
          {steps.map((s, i) => (
            <li
              key={s.title}
              data-step={i}
              ref={(el) => { items.current[i] = el; }}
              className="grid gap-6 lg:min-h-[64svh] lg:content-center"
            >
              <div data-reveal className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-6 gap-y-2 border-t border-rule pt-5 lg:gap-x-10">
                <span aria-hidden="true" className={`figure text-poster transition-colors duration-200 ${active === i ? "text-ink" : "text-muted"}`}>{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="title">{s.title}</h3>
                  <p className="mt-3 max-w-[46ch] text-ink-2">{s.body}</p>
                </div>
              </div>
              <div className="w-full max-w-[380px] lg:hidden" data-reveal>{visuals[i]}</div>
            </li>
          ))}
        </ol>

        <div className="relative hidden lg:col-span-4 lg:col-start-9 lg:block">
          <div className="sticky top-28 h-[min(600px,64svh)]">
            {visuals.map((v, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`absolute inset-0 grid content-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${active === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
              >
                <div className="w-full">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
