"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { createLog, getEpisodeLimits, searchMedia, setNowWatching } from "@/lib/actions";
import type { EpisodeLimits } from "@/lib/core/episodes";
import { EpisodeFields } from "@/components/episode-fields";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";
import { Minus, Star } from "lucide-react";

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
  // Episode counts of the picked series/anime, looked up once it is chosen. Tied to the title so a stale answer is never shown.
  const [fetched, setFetched] = useState<{ id: string; limits: EpisodeLimits | null } | null>(null);
  const limits = picked && fetched?.id === picked.id ? fetched.limits : null;
  useEffect(() => {
    if (!picked || picked.kind === "movie") return;
    let live = true;
    getEpisodeLimits(picked.id).then((l) => { if (live) setFetched({ id: picked.id, limits: l }); }).catch(() => {});
    return () => { live = false; };
  }, [picked]);
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
            className="field min-h-14 flex-1 text-lg" />
          <button disabled={searching} className="btn btn-primary min-h-14 shrink-0">
            {t("searchCta")}
          </button>
        </form>
        {!tmdb && <p className="text-sm text-muted">{t("tmdbOff")}</p>}
        {results && results.length === 0 && <p className="plate pt-5 text-ink-2">{t("noResults")}</p>}
        {results && results.length > 0 && (
          <ul className="rows grid">
            {results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setPicked(m)} className="grid w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 py-3 text-left transition-colors duration-150 hover:bg-paper-2 active:translate-y-px">
                  <Poster media={m} size="sm" />
                  <span className="grid min-w-0 gap-1">
                    <span className="title text-xl">{m.title}</span>
                    <span className="text-sm text-muted">{[m.year, tk(m.kind)].filter(Boolean).join(", ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // The picked title leads the form: its poster printed large beside its name.
  const pickedCard = (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-4">
      <Poster media={picked} />
      <div className="grid min-w-0 content-start justify-items-start gap-2">
        <p className="title">{picked.title}</p>
        <p className="text-sm text-muted">{[picked.year, tk(picked.kind)].filter(Boolean).join(", ")}</p>
        <button type="button" onClick={() => setPicked(null)} className="btn btn-quiet btn-sm mt-2">
          {tc("change")}
        </button>
      </div>
    </div>
  );

  const modeToggle = (
    <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-2 border-b border-rule">
      {(["watched", "watching"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`-mb-px min-h-11 border-b-2 px-3 font-display text-lg transition-colors duration-150 active:translate-y-px ${mode === m ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
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
          <legend className="mb-2 text-sm text-ink-2">{t("progress")}</legend>
          <EpisodeFields key={picked.id + (limits ? "k" : "")} limits={limits} seasonName="season" episodeName="episode" disabled={picked.kind === "movie"} />
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

      <RatingField rating={rating} onChange={setRating} label={t("rating")} valueText={rating ? tf("rating", { stars: rating / 2 }) : t("noRating")} emptyText={t("noRating")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">
          {t("watchedOn")}
          <input type="date" name="watchedOn" defaultValue={today} max={today} required className="field tabular" />
        </label>
        <label className="field-label">
          {t("platform")}
          <input name="platform" maxLength={60} placeholder={t("platformPlaceholder")} className="field" />
        </label>
      </div>

      {picked.kind !== "movie" && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-2 text-sm text-ink-2">{t("episodeLogged")}</legend>
          <EpisodeFields key={picked.id + (limits ? "k" : "")} limits={limits} seasonName="season" episodeName="logEpisode" optionalSeasonLabel={t("seasonLogged")} />
        </fieldset>
      )}

      <label className="field-label">
        {t("review")}
        <textarea name="review" rows={4} maxLength={4000} className="field" />
      </label>

      <div className="grid">
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="containsSpoilers" className="size-5 shrink-0 accent-accent" />{t("spoilers")}</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="isRewatch" className="size-5 shrink-0 accent-accent" />{t("rewatch")}</label>
      </div>

      {members.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-ink-2">{t("with")}</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-rule px-3 text-ink-2 transition-colors duration-150 hover:border-muted has-[:checked]:border-ink has-[:checked]:text-ink">
                <input type="checkbox" name="watchedWith" value={m.id} defaultChecked={initialWith.includes(m.id)} className="size-5 shrink-0 accent-accent" />
                {m.name}
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
    <button disabled={status.pending} className="btn btn-primary w-full sm:w-fit">
      {status.pending ? pending : label}
    </button>
  );
}


/**
 * The rating, the form's signature: five 44px stars drawn over the native range input (0..10 half stars), which stays the
 * mechanism for pointer, touch and keyboard. The input is 22px wider than the stars and its thumb 22px wide, so a press on
 * a half star sets that half; the 22px before the first star is the "no rating" stop.
 */
export function RatingField({ rating, onChange, label, valueText, emptyText }: {
  rating: number; onChange: (rating: number) => void; label: string; valueText: string; emptyText: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-ink-2">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="group relative flex h-11 w-[242px] items-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
          <span aria-hidden="true" className="grid h-11 w-[22px] shrink-0 place-items-center text-muted">
            <Minus size={14} strokeWidth={1.6} aria-hidden="true" />
          </span>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} aria-hidden="true" className="relative size-11 shrink-0">
              <Star fill="currentColor" strokeWidth={0} aria-hidden="true" className="size-11 text-rule transition-colors duration-150 group-hover:text-muted" />
              <span className="absolute inset-y-0 left-0 overflow-hidden text-accent" style={{ width: rating >= i * 2 ? "100%" : rating >= i * 2 - 1 ? "50%" : "0%" }}>
                <Star fill="currentColor" strokeWidth={0} aria-hidden="true" className="size-11 max-w-none" />
              </span>
            </span>
          ))}
          <input type="range" min={0} max={10} step={1} value={rating} onChange={(e) => onChange(Number(e.target.value))}
            aria-label={label} aria-valuetext={valueText}
            className="absolute inset-0 m-0 h-11 w-full cursor-pointer appearance-none opacity-0 [&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:size-[22px] [&::-webkit-slider-thumb]:appearance-none" />
        </div>
        {!rating && <span className="text-sm text-muted">{emptyText}</span>}
      </div>
    </fieldset>
  );
}
