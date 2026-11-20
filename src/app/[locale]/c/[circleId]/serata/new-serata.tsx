"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Check, Plus, Search, Sparkles } from "lucide-react";
import { searchMedia } from "@/lib/actions";
import { createSerata } from "@/lib/serata/actions";
import { suggestRosterAction } from "@/lib/discover-actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";
import { Link } from "@/i18n/navigation";

const MAX = 8;

type Services = { names: string[]; setBy: number; members: number };

/**
 * Setting up a Serata: pick how to vote, pick 2 to 8 candidates (tap a poster, or let Pausa fill the list), open it.
 * The open button stays in reach at the bottom of the screen and always says what is missing or how many titles go in.
 */
export function NewSerata({ circleId, quickPicks, tmdb, services }: { circleId: string; quickPicks: MediaSummary[]; tmdb: boolean; services: Services }) {
  const t = useTranslations("serata");
  const tl = useTranslations("log");
  const locale = useLocale();
  const [suggested, setSuggested] = useState<MediaSummary[]>([]);
  const [on, setOn] = useState<Record<string, string[]>>({});
  const [suggesting, startSuggest] = useTransition();
  const [suggestEmpty, setSuggestEmpty] = useState(false);
  const [mode, setMode] = useState<"bracket" | "table">("bracket");
  const [picked, setPicked] = useState<MediaSummary[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[] | null>(null);
  const [searching, startSearch] = useTransition();

  // Results as you type, as in the log form: a short pause, two letters at least, only the latest answer kept.
  const latest = useRef("");
  useEffect(() => {
    const clean = query.trim();
    latest.current = clean;
    if (clean.length < 2) return;
    const id = setTimeout(() => startSearch(async () => {
      const items = await searchMedia(clean, locale);
      if (latest.current === clean) setResults(items);
    }), 350);
    return () => clearTimeout(id);
  }, [query, locale]);

  const toggle = (m: MediaSummary) =>
    setPicked((cur) => (cur.some((p) => p.id === m.id) ? cur.filter((p) => p.id !== m.id) : cur.length < MAX ? [...cur, m] : cur));

  // Found titles first (they are what the person just asked for), then the group's suggestions, then the watchlist.
  const found = query.trim().length >= 2 ? results ?? [] : [];
  const seen = new Set<string>();
  const pool = [...found, ...picked, ...suggested, ...quickPicks].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

  function suggest() {
    setSuggestEmpty(false);
    startSuggest(async () => {
      const res = await suggestRosterAction(circleId, locale);
      setSuggested(res.titles);
      setOn(res.on);
      setPicked(res.titles.slice(0, MAX));
      setSuggestEmpty(res.titles.length === 0);
    });
  }

  const ready = picked.length >= 2;

  return (
    <form action={createSerata} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="circleId" value={circleId} />
      <input type="hidden" name="mode" value={mode} />
      {picked.map((m) => <input key={m.id} type="hidden" name="mediaId" value={m.id} />)}

      {/* How to vote: two choices, one of them always on, ticked. */}
      <div role="radiogroup" aria-label={t("modeLabel")} className="grid grid-cols-2 gap-3">
        {(["bracket", "table"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`relative grid min-w-0 content-start gap-2 border p-3 pr-9 text-left transition-colors duration-150 ${mode === m ? "border-accent bg-paper-2" : "border-rule hover:border-muted"}`}
          >
            <span aria-hidden="true" className={`absolute right-3 top-3 grid size-5 place-items-center border ${mode === m ? "border-accent bg-accent text-accent-ink" : "border-muted"}`}>
              {mode === m && <Check size={14} strokeWidth={2.4} />}
            </span>
            <span className="title text-2xl">{t(`mode.${m}`)}</span>
            <span className={`text-sm ${mode === m ? "text-ink-2" : "text-muted"}`}>{t(`modeHint.${m}`)}</span>
          </button>
        ))}
      </div>

      <section className="grid gap-4" aria-labelledby="candidates">
        <div className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="candidates" className="title">{t("pickTitle")}</h2>
            <span className="tabular shrink-0 text-sm text-muted" aria-live="polite">{t("picked", { count: picked.length, max: MAX })}</span>
          </div>
          <p className="text-sm text-muted">{t("pickHint")}</p>
        </div>

        <div className="well grained grid gap-2 p-4">
          <button type="button" onClick={suggest} disabled={suggesting} className="btn w-full whitespace-normal">
            <Sparkles size={18} strokeWidth={1.6} aria-hidden="true" />
            {suggesting ? t("suggesting") : t("suggest")}
          </button>
          <p className="mt-1 text-sm text-muted">{t("suggestHint")}</p>
          {services.names.length > 0 ? (
            <p className="text-sm text-ink-2">{t("servicesCommon", { names: services.names.join(", "), setBy: services.setBy, members: services.members })}</p>
          ) : (
            <p className="text-sm text-muted">{t("servicesNone")} <Link href="/account" className="link">{t("servicesLink")}</Link></p>
          )}
          {suggestEmpty && <p role="status" className="text-sm text-ink">{t("suggestEmpty")}</p>}
        </div>

        <div className="relative">
          <label htmlFor="serata-q" className="sr-only">{t("search")}</label>
          <Search size={20} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input id="serata-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            enterKeyHint="search" autoComplete="off" spellCheck={false} className="field w-full pl-12" />
        </div>
        <p aria-live="polite" className="sr-only">{searching ? tl("searching") : ""}</p>
        {!tmdb && <p className="text-sm text-muted">{tl("tmdbOff")}</p>}

        {pool.length === 0 ? (
          <p className="plate pt-5 text-ink-2">{t("emptyPool")}</p>
        ) : (
          <ul className={`grid grid-cols-3 gap-x-3 gap-y-5 transition-opacity duration-150 sm:grid-cols-4 ${searching ? "opacity-70" : ""}`}>
            {pool.map((m) => {
              const n = picked.findIndex((p) => p.id === m.id);
              const full = n < 0 && picked.length >= MAX;
              return (
                <li key={m.id} className="min-w-0">
                  <button type="button" onClick={() => toggle(m)} aria-pressed={n >= 0} disabled={full}
                    className="group grid w-full min-w-0 content-start gap-1.5 text-left disabled:opacity-40">
                    <span className="relative block">
                      <Poster media={m} />
                      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 border-2 transition-colors duration-150 ${n >= 0 ? "border-accent" : "border-transparent group-hover:border-muted"}`} />
                      <span aria-hidden="true" className={`tabular pointer-events-none absolute right-0 top-0 grid size-7 place-items-center text-xs font-semibold transition-colors duration-150 ${n >= 0 ? "bg-accent text-accent-ink" : "bg-paper/80 text-ink"}`}>
                        {n >= 0 ? n + 1 : <Plus size={16} strokeWidth={2} />}
                      </span>
                    </span>
                    <span className={`line-clamp-2 text-sm leading-tight [overflow-wrap:anywhere] ${n >= 0 ? "font-semibold text-ink" : "text-ink-2"}`}>{m.title}</span>
                    {on[m.id]?.length ? <span className="truncate text-sm text-muted">{on[m.id].join(", ")}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-rule bg-paper px-4 py-3 lg:bottom-0 lg:mx-0 lg:border-t-0 lg:px-0">
        <Submit disabled={!ready} label={ready ? t("createWith", { count: picked.length }) : t("needTwo", { count: picked.length })} pending={tl("saving")} />
      </div>
    </form>
  );
}

function Submit({ disabled, label, pending }: { disabled: boolean; label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button disabled={disabled || status.pending} className="btn btn-primary min-h-12 w-full disabled:opacity-100 disabled:border-rule disabled:bg-paper-2 disabled:text-ink-2">
      {status.pending ? pending : label}
    </button>
  );
}
