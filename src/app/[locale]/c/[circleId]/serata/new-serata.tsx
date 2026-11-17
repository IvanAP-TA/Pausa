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
    <form action={createSerata} className="grid gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="circleId" value={circleId} />
      <input type="hidden" name="mode" value={mode} />
      {picked.map((m) => <input key={m.id} type="hidden" name="mediaId" value={m.id} />)}

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">{t("modeLabel")}</legend>
        {(["bracket", "table"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`grid gap-1 rounded-md border p-3 text-left transition-colors ${mode === m ? "border-accent bg-paper-2" : "border-rule hover:border-muted"}`}
          >
            <span className="font-display text-lg font-semibold">{t(`mode.${m}`)}</span>
            <span className="text-xs text-muted">{t(`modeHint.${m}`)}</span>
          </button>
        ))}
      </fieldset>

      <section className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{t("pickTitle")}</h2>
          <span className="tabular text-xs text-muted">{t("picked", { count: picked.length, max: MAX })}</span>
        </div>

        <div className="grid gap-1.5 rounded-md border border-dashed border-rule p-3">
          <button type="button" onClick={suggest} disabled={suggesting}
            className="min-h-11 w-full rounded-full border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-on-accent disabled:opacity-60">
            {suggesting ? t("suggesting") : t("suggest")}
          </button>
          <p className="text-xs text-muted">{t("suggestHint")}</p>
          {services.names.length > 0 ? (
            <p className="text-xs text-second-text">{t("servicesCommon", { names: services.names.join(", "), setBy: services.setBy, members: services.members })}</p>
          ) : (
            <p className="text-xs text-muted">{t("servicesNone")}</p>
          )}
          {suggestEmpty && <p role="status" className="text-xs text-accent">{t("suggestEmpty")}</p>}
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
            className="min-h-11 min-w-0 flex-1 rounded-sm border border-rule bg-paper-2 px-3 placeholder:text-muted/70" />
          <button type="button" disabled={searching || !query.trim()}
            onClick={() => startSearch(async () => setResults(await searchMedia(query, locale)))}
            className="min-h-11 shrink-0 rounded-full border border-rule bg-paper-3 px-4 text-sm font-semibold hover:bg-rule disabled:opacity-50">
            {tl("searchCta")}
          </button>
        </div>
        {!tmdb && <p className="text-xs text-muted">{tl("tmdbOff")}</p>}

        {pool.length === 0 ? (
          <p className="text-sm text-muted">{t("emptyPool")}</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {pool.map((m) => {
              const n = picked.findIndex((p) => p.id === m.id);
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => toggle(m)} aria-pressed={n >= 0}
                    disabled={n < 0 && picked.length >= MAX}
                    className={`relative grid w-full gap-1 rounded-sm text-left transition-opacity disabled:opacity-40 ${n >= 0 ? "" : "opacity-80 hover:opacity-100"}`}>
                    <span className={`block rounded-sm outline-offset-2 ${n >= 0 ? "outline outline-2 outline-accent" : ""}`}>
                      <Poster media={m} size="sm" />
                    </span>
                    {n >= 0 && (
                      <span className="tabular absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-on-accent">{n + 1}</span>
                    )}
                    <span className="line-clamp-2 text-[11px] leading-tight">{m.title}</span>
                    {on[m.id]?.length ? <span className="truncate text-[10px] text-second-text">{on[m.id].join(", ")}</span> : null}
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
    <button disabled={disabled || status.pending}
      className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
      {status.pending ? pending : label}
    </button>
  );
}
