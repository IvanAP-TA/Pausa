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
          <div className="flex items-baseline justify-between gap-3 text-on-second-muted">
            <p className="font-display text-xl text-on-second">{round}</p>
            <p className="tabular text-sm">{s.progress.replace("{n}", String(stage + 1))}</p>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => <i key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < stage ? "bg-on-second" : i === stage ? "bg-accent" : "bg-on-second-muted/30"}`} />)}
          </div>
          <p className="text-sm text-on-second-muted">{s.pick}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            {pair.map((f, i) => (
              <div key={f.key} className="contents">
                {i === 1 && <span className="font-display text-sm text-on-second-muted">{s.vs}</span>}
                <button
                  type="button"
                  onClick={() => pick(f)}
                  aria-pressed={chosen === f.key}
                  className={`group grid gap-2 rounded-md border-2 p-1.5 text-left transition-[transform,border-color,opacity] duration-300 ease-out hover:-translate-y-1 focus-visible:-translate-y-1 ${
                    chosen === f.key ? "scale-[1.03] border-accent" : chosen ? "scale-95 border-transparent opacity-40" : "border-transparent hover:border-on-second-muted/60"}`}
                >
                  <Poster media={{ id: f.key, title: f.title, posterPath: f.posterPath }} size="md" />
                  <span className="px-1 pb-1">
                    <span className="block text-sm font-semibold leading-tight text-on-second">{f.title}</span>
                    <span className="tabular text-xs text-on-second-muted">{f.year}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : champion ? (
        <div className="grid justify-items-center gap-5 text-center">
          <div className="w-full max-w-[260px] animate-[rise_.7s_var(--ease-out)_both]">
            <SerataCard kicker={s.kicker} subtitle={s.subtitle} title={champion.title} posterPath={champion.posterPath} lines={[s.line1, s.line2]} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={ctaHref} className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-hover">{s.cta}</a>
            <button type="button" onClick={reset} className="min-h-12 rounded-full border border-on-second-muted/50 px-5 text-sm text-on-second hover:bg-paper/10">{s.again}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
