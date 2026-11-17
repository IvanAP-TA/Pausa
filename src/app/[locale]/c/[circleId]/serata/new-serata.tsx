"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { searchMedia } from "@/lib/actions";
import { createSerata } from "@/lib/serata/actions";
import { suggestRosterAction } from "@/lib/discover-actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";

const MAX = 8;

type Services = { names: string[]; setBy: number; members: number };

export function NewSerata({ circleId, quickPicks, tmdb, services }: { circleId: string; quickPicks: MediaSummary[]; tmdb: boolean; services: Services }) {
  const t = useTranslations("serata");
  const [suggested, setSuggested] = useState<MediaSummary[]>([]);
  const [on, setOn] = useState<Record<string, string[]>>({});
  const [suggesting, startSuggest] = useTransition();
  const [suggestEmpty, setSuggestEmpty] = useState(false);
  const tl = useTranslations("log");
  const locale = useLocale();
  const [mode, setMode] = useState<"bracket" | "table">("bracket");
  const [picked, setPicked] = useState<MediaSummary[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[] | null>(null);
  const [searching, startSearch] = useTransition();

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const toggle = (m: MediaSummary) =>
    setPicked((cur) => (cur.some((p) => p.id === m.id) ? cur.filter((p) => p.id !== m.id) : cur.length < MAX ? [...cur, m] : cur));

  const known = new Set(quickPicks.map((q) => q.id));
  const extra = suggested.filter((m) => !known.has(m.id));
  extra.forEach((m) => known.add(m.id));
  const pool = [...quickPicks, ...extra, ...(results ?? []).filter((r) => !known.has(r.id))];

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

  return (
    <form action={createSerata} className="grid gap-8">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="circleId" value={circleId} />
      <input type="hidden" name="mode" value={mode} />
      {picked.map((m) => <input key={m.id} type="hidden" name="mediaId" value={m.id} />)}

      {/* The mode: two square cells, the chosen one edged in amber. */}
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">{t("modeLabel")}</legend>
        {(["bracket", "table"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`grid min-h-36 min-w-0 content-between gap-3 border p-3 text-left transition-colors duration-150 active:translate-y-px ${mode === m ? "border-accent bg-paper-2" : "border-rule hover:border-muted"}`}
          >
            <span className="title text-2xl">{t(`mode.${m}`)}</span>
            <span className={`text-sm ${mode === m ? "text-ink-2" : "text-muted"}`}>{t(`modeHint.${m}`)}</span>
          </button>
        ))}
      </fieldset>

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="title">{t("pickTitle")}</h2>
          <span className="tabular shrink-0 text-sm text-muted">{t("picked", { count: picked.length, max: MAX })}</span>
        </div>

        <div className="well grained grid gap-2 p-4">
          <button type="button" onClick={suggest} disabled={suggesting} className="btn w-full whitespace-normal">
            {suggesting ? t("suggesting") : t("suggest")}
          </button>
          <p className="mt-1 text-sm text-muted">{t("suggestHint")}</p>
          {services.names.length > 0 ? (
            <p className="text-sm text-ink-2">{t("servicesCommon", { names: services.names.join(", "), setBy: services.setBy, members: services.members })}</p>
          ) : (
            <p className="text-sm text-muted">{t("servicesNone")}</p>
          )}
          {suggestEmpty && <p role="status" className="text-sm text-ink">{t("suggestEmpty")}</p>}
        </div>

        <div className="flex gap-2">
          <label htmlFor="serata-q" className="sr-only">{t("search")}</label>
          <input id="serata-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (query.trim()) startSearch(async () => setResults(await searchMedia(query, locale)));
              }
            }}
            className="field flex-1" />
          <button type="button" disabled={searching || !query.trim()}
            onClick={() => startSearch(async () => setResults(await searchMedia(query, locale)))}
            className="btn btn-quiet shrink-0">
            {tl("searchCta")}
          </button>
        </div>
        {!tmdb && <p className="text-sm text-muted">{tl("tmdbOff")}</p>}

        {pool.length === 0 ? (
          <p className="plate pt-5 text-ink-2">{t("emptyPool")}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
            {pool.map((m) => {
              const n = picked.findIndex((p) => p.id === m.id);
              return (
                <li key={m.id} className="min-w-0">
                  <button type="button" onClick={() => toggle(m)} aria-pressed={n >= 0}
                    disabled={n < 0 && picked.length >= MAX}
                    className={`grid w-full min-w-0 content-start gap-1.5 text-left transition-opacity duration-150 active:translate-y-px disabled:opacity-40 ${n >= 0 ? "" : "opacity-80 hover:opacity-100"}`}>
                    <span className="relative block">
                      <Poster media={m} />
                      {n >= 0 && (
                        <>
                          <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-accent" />
                          <span aria-hidden="true" className="tabular pointer-events-none absolute right-0 top-0 grid size-6 place-items-center bg-accent text-xs font-semibold text-accent-ink">{n + 1}</span>
                        </>
                      )}
                    </span>
                    <span className={`line-clamp-2 text-sm leading-tight [overflow-wrap:anywhere] ${n >= 0 ? "font-semibold" : ""}`}>{m.title}</span>
                    {on[m.id]?.length ? <span className="truncate text-sm text-muted">{on[m.id].join(", ")}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Submit disabled={picked.length < 2 || !pool.some((m) => isPicked(m.id))} label={t("create")} pending={tl("saving")} />
    </form>
  );
}

function Submit({ disabled, label, pending }: { disabled: boolean; label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button disabled={disabled || status.pending} className="btn btn-primary min-h-12 w-full sm:w-fit">
      {status.pending ? pending : label}
    </button>
  );
}
