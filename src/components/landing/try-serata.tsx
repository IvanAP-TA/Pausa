"use client";

import { useEffect, useRef, useState } from "react";
import { Poster } from "@/components/poster";
import { SerataCard } from "@/components/serata-card";

type Film = { key: string; title: string; posterPath: string; year: number };
type Props = {
  films: Film[];
  strings: {
    pick: string; progress: string; first: string; second: string; final: string; vs: string; again: string; cta: string;
    kicker: string; subtitle: string; line1: string; line2: string;
  };
  ctaHref: string;
};

/**
 * A real, tiny Serata (4 titles → 2 matches → final) that runs in the page, no account. It's the product's
 * best argument: people feel the two-minute decision before signing up.
 */
export function TrySerata({ films, strings: s, ctaHref }: Props) {
  const [stage, setStage] = useState(0); // 0 first match, 1 second, 2 final, 3 done
  const [winners, setWinners] = useState<Film[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const pair: [Film, Film] | null =
    stage === 0 ? [films[0], films[1]] : stage === 1 ? [films[2], films[3]] : stage === 2 ? [winners[0], winners[1]] : null;
  const round = stage === 0 ? s.first : stage === 1 ? s.second : s.final;

  function pick(f: Film) {
    if (chosen) return;
    setChosen(f.key);
    timer.current = setTimeout(() => {
      setWinners((w) => [...w, f]);
      setStage((n) => n + 1);
      setChosen(null);
    }, 520);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setStage(0); setWinners([]); setChosen(null);
  }

  const champion = stage === 3 ? winners[2] : null;

  return (
    <div className="mx-auto w-full max-w-xl" aria-live="polite">
      {pair ? (
        <div className="grid gap-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="title">{round}</p>
            <p className="tabular text-sm text-muted">{s.progress.replace("{n}", String(stage + 1))}</p>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => <i key={i} className={`h-0.5 flex-1 transition-colors duration-200 ${i < stage ? "bg-ink" : i === stage ? "bg-accent" : "bg-rule"}`} />)}
          </div>
          <p className="text-sm text-ink-2">{s.pick}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
            {pair.map((f, i) => (
              <div key={f.key} className="contents">
                {i === 1 && <span className="font-display text-xl text-muted">{s.vs}</span>}
                <button
                  type="button"
                  onClick={() => pick(f)}
                  aria-pressed={chosen === f.key}
                  className={`grid gap-2 border-2 p-1.5 text-left transition-[border-color,opacity,transform] duration-200 ease-out active:translate-y-px ${
                    chosen === f.key ? "border-accent" : chosen ? "cursor-default border-transparent opacity-40" : "border-rule hover:border-ink"}`}
                >
                  <Poster media={{ id: f.key, title: f.title, posterPath: f.posterPath }} size="md" />
                  <span className="px-1 pb-1">
                    <span className="block font-semibold leading-tight text-ink">{f.title}</span>
                    <span className="tabular text-sm text-muted">{f.year}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : champion ? (
        <div className="grid justify-items-center gap-6 text-center">
          <div className="rise w-full max-w-[260px]">
            <SerataCard kicker={s.kicker} subtitle={s.subtitle} title={champion.title} posterPath={champion.posterPath} lines={[s.line1, s.line2]} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Amber from md up; on phones the sticky bar already holds the one amber action. */}
            <a href={ctaHref} className="btn md:border-accent md:bg-accent md:text-accent-ink md:hover:border-accent-hover md:hover:bg-accent-hover">{s.cta}</a>
            <button type="button" onClick={reset} className="btn btn-quiet">{s.again}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
