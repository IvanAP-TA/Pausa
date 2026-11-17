"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { createLog, searchMedia, setNowWatching } from "@/lib/actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";

type Props = {
  circleId: string; today: string; tmdb: boolean; members: { id: string; name: string }[];
  initialPicked?: MediaSummary | null; initialWith?: string[];
};

export function LogForm({ circleId, today, tmdb, members, initialPicked = null, initialWith = [] }: Props) {
  const t = useTranslations("log");
  const tk = useTranslations("kind");
  const tf = useTranslations("feed");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[] | null>(null);
  const [picked, setPicked] = useState<MediaSummary | null>(initialPicked);
  const [rating, setRating] = useState(0);
  const [mode, setMode] = useState<"watched" | "watching">("watched");
  const [searching, startSearch] = useTransition();

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    startSearch(async () => setResults(await searchMedia(query, locale)));
  }

  if (!picked) {
    return (
      <section className="grid gap-4">
        <form onSubmit={runSearch} role="search" className="flex gap-2">
          <label htmlFor="q" className="sr-only">{t("search")}</label>
          <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} autoFocus
            className="min-h-12 min-w-0 flex-1 rounded-sm border border-rule bg-paper-2 px-4 placeholder:text-muted/70" />
          <button disabled={searching} className="min-h-12 shrink-0 rounded-full border border-rule bg-paper-3 px-5 font-semibold hover:bg-rule disabled:opacity-60">
            {t("searchCta")}
          </button>
        </form>
        {!tmdb && <p className="text-xs text-muted">{t("tmdbOff")}</p>}
        {results && results.length === 0 && <p className="text-sm text-muted">{t("noResults")}</p>}
        {results && results.length > 0 && (
          <ul className="grid grid-cols-3 gap-3">
            {results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setPicked(m)} className="grid w-full gap-1.5 rounded-sm text-left transition-transform hover:-translate-y-0.5">
                  <Poster media={m} />
                  <span className="text-[13px] font-semibold leading-tight">{m.title}</span>
                  <span className="text-xs text-muted">{tk(m.kind)}{m.year ? ` · ${m.year}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const pickedCard = (
    <div className="flex items-center gap-3 rounded-md bg-paper-2 p-3">
      <Poster media={picked} size="sm" className="w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold leading-tight">{picked.title}</p>
        <p className="text-xs text-muted">{tk(picked.kind)}{picked.year ? ` · ${picked.year}` : ""}</p>
      </div>
      <button type="button" onClick={() => setPicked(null)} className="min-h-10 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        {tc("change")}
      </button>
    </div>
  );

  const modeToggle = (
    <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-2 rounded-full border border-rule bg-paper-2 p-1 text-sm">
      {(["watched", "watching"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`min-h-10 rounded-full px-3 font-semibold transition-colors ${mode === m ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}
        >
          {m === "watched" ? t("modeWatched") : t("modeWatching")}
        </button>
      ))}
    </div>
  );

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="circleId" value={circleId} />
      <input type="hidden" name="mediaId" value={picked.id} />
    </>
  );

  if (mode === "watching") {
    return (
      <form action={setNowWatching} className="grid gap-6">
        {hidden}
        {pickedCard}
        {modeToggle}
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm text-muted">{t("progress")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-muted">
              {t("season")}
              <input type="number" name="season" min={1} max={99} inputMode="numeric" disabled={picked.kind === "movie"} placeholder={picked.kind === "anime" ? "–" : "1"}
                className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60 disabled:opacity-40" />
            </label>
            <label className="grid gap-1.5 text-sm text-muted">
              {t("episode")}
              <input type="number" name="episode" min={1} max={9999} inputMode="numeric" placeholder="1"
                className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
            </label>
          </div>
        </fieldset>
        <Submit label={t("setWatching")} pending={t("saving")} />
      </form>
    );
  }

  return (
    <form action={createLog} className="grid gap-6">
      {hidden}
      <input type="hidden" name="rating" value={rating} />
      {pickedCard}
      {modeToggle}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">{t("rating")}</legend>
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={10} step={1} value={rating} onChange={(e) => setRating(Number(e.target.value))}
            aria-label={t("rating")} aria-valuetext={rating ? tf("rating", { stars: rating / 2 }) : t("noRating")}
            className="flex-1 accent-[var(--color-accent)]" />
          {rating ? <Stars rating={rating} label={tf("rating", { stars: rating / 2 })} className="text-lg" /> : <span className="text-sm text-muted">{t("noRating")}</span>}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm text-muted">
          {t("watchedOn")}
          <input type="date" name="watchedOn" defaultValue={today} max={today} required className="min-h-12 rounded-sm border border-rule bg-paper-2 px-3 text-ink" />
        </label>
        <label className="grid gap-1.5 text-sm text-muted">
          {t("platform")}
          <input name="platform" maxLength={60} placeholder={t("platformPlaceholder")} className="min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
        </label>
      </div>

      {picked.kind !== "movie" && (
        <label className="grid gap-1.5 text-sm text-muted sm:max-w-40">
          {t("seasonLogged")}
          <input type="number" name="season" min={1} max={99} inputMode="numeric" placeholder={t("wholeShow")} className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
        </label>
      )}

      <label className="grid gap-1.5 text-sm text-muted">
        {t("review")}
        <textarea name="review" rows={4} maxLength={4000} className="rounded-sm border border-rule bg-paper-2 p-3 text-[15px] text-ink" />
      </label>

      <div className="grid gap-3 text-sm">
        <label className="flex min-h-10 items-center gap-3"><input type="checkbox" name="containsSpoilers" className="size-5 accent-[var(--color-accent)]" />{t("spoilers")}</label>
        <label className="flex min-h-10 items-center gap-3"><input type="checkbox" name="isRewatch" className="size-5 accent-[var(--color-accent)]" />{t("rewatch")}</label>
      </div>

      {members.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-muted">{t("with")}</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="cursor-pointer">
                <input type="checkbox" name="watchedWith" value={m.id} defaultChecked={initialWith.includes(m.id)} className="peer sr-only" />
                <span className="inline-flex min-h-9 items-center rounded-full border border-rule px-3.5 text-sm text-muted transition-colors peer-checked:border-second peer-checked:bg-second peer-checked:text-on-second peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  {m.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Submit label={t("submit")} pending={t("saving")} />
    </form>
  );
}

function Submit({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button disabled={status.pending} className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
      {status.pending ? pending : label}
    </button>
  );
}
