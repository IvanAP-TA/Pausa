"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { createLog, getEpisodeLimits, searchMedia, setNowWatching } from "@/lib/actions";
import { getTitleDetail } from "@/lib/space-actions";
import { PersonChip } from "@/components/person-chip";
import type { EpisodeLimits } from "@/lib/core/episodes";
import { EpisodeFields } from "@/components/episode-fields";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";
import { ChevronDown, Lock, Minus, Search, Star, Users } from "lucide-react";

type Props = {
  circleId: string; circleName: string; today: string; tmdb: boolean; members: { id: string; name: string; image?: string | null }[];
  initialPicked?: MediaSummary | null; initialWith?: string[]; initialPrivate?: boolean;
};

/**
 * Logging a viewing, the habit of the app, in as few taps as possible: type (results come as you type), tap the title,
 * tap the stars, save. Everything else (date, where, episode, spoilers, with whom) waits behind "Aggiungi dettagli",
 * and the save button stays in reach at the bottom of the screen and says where the viewing goes.
 */
export function LogForm({ circleId, circleName, today, tmdb, members, initialPicked = null, initialWith = [], initialPrivate = false }: Props) {
  const t = useTranslations("log");
  const tk = useTranslations("kind");
  const tf = useTranslations("feed");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: MediaSummary[] } | null>(null);
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
  // What the picked title is about: asked once it is chosen. No synopsis = the details offer a field to write one.
  const [about, setAbout] = useState<{ id: string; overview: string | null; genres: string[] } | null>(null);
  const detail = picked && about?.id === picked.id ? about : null;
  useEffect(() => {
    if (!picked) return;
    let live = true;
    getTitleDetail(picked.id, locale)
      .then((d) => { if (live) setAbout({ id: picked.id, ...d }); })
      .catch(() => { if (live) setAbout({ id: picked.id, overview: null, genres: [] }); });
    return () => { live = false; };
  }, [picked, locale]);
  const [rating, setRating] = useState(0);
  const [mode, setMode] = useState<"watched" | "watching">("watched");
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [searching, startSearch] = useTransition();

  // Results as you type: a short pause after the last key, two letters at least; only the answer to the latest text is kept.
  const latest = useRef("");
  function search(q: string) {
    const clean = q.trim();
    latest.current = clean;
    if (clean.length < 2) return;
    startSearch(async () => {
      const items = await searchMedia(clean, locale);
      if (latest.current === clean) setResults({ q: clean, items });
    });
  }
  useEffect(() => {
    const id = setTimeout(() => search(query), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (!picked) {
    const shown = query.trim().length >= 2 ? results : null;
    return (
      <section className="grid gap-4">
        <h1 className="display">{t("title")}</h1>
        <form onSubmit={(e) => { e.preventDefault(); search(query); }} role="search" className="relative">
          <label htmlFor="q" className="sr-only">{t("search")}</label>
          <Search size={20} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")}
            enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
            className="field min-h-14 w-full pl-12 text-lg" />
        </form>
        <p aria-live="polite" className="sr-only">{searching ? t("searching") : shown ? t("resultsCount", { count: shown.items.length }) : ""}</p>
        {!tmdb && <p className="text-sm text-muted">{t("tmdbOff")}</p>}
        {searching && !shown && <p className="text-sm text-muted">{t("searching")}</p>}
        {shown && shown.items.length === 0 && !searching && <p className="plate pt-5 text-ink-2">{t("noResults")}</p>}
        {shown && shown.items.length > 0 && (
          <ul className={`rows grid transition-opacity duration-150 ${searching ? "opacity-60" : ""}`}>
            {shown.items.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setPicked(m)} className="grid min-h-[92px] w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 py-3 text-left transition-colors duration-150 hover:bg-paper-2 active:bg-paper-2">
                  <Poster media={m} size="sm" />
                  <span className="grid min-w-0 gap-1">
                    <span className="title text-xl [overflow-wrap:anywhere]">{m.title}</span>
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

  // The picked title: a compact head (poster, name, change), the synopsis folded to two lines.
  const pickedCard = (
    <div className="grid gap-3">
      <h1 className="sr-only">{t("title")}</h1>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-4">
        <Poster media={picked} size="sm" />
        <div className="grid min-w-0 content-start justify-items-start gap-1">
          <p className="title text-2xl [overflow-wrap:anywhere]">{picked.title}</p>
          <p className="text-sm text-muted">{[picked.year, tk(picked.kind), ...(detail?.genres.slice(0, 2) ?? [])].filter(Boolean).join(", ")}</p>
          <button type="button" onClick={() => { setPicked(null); setRating(0); }} className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm text-ink-2 underline underline-offset-4 transition-colors duration-150 hover:text-ink">
            {tc("change")}
          </button>
        </div>
      </div>
      {detail?.overview ? (
        <details className="group text-ink-2">
          <summary className="cursor-pointer list-none marker:content-none">
            <span className="line-clamp-2 group-open:line-clamp-none">{detail.overview}</span>
            <span className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted group-open:hidden">{t("more")}<ChevronDown size={16} aria-hidden="true" /></span>
          </summary>
        </details>
      ) : !detail ? (
        <p aria-live="polite" className="skeleton min-h-[2lh]"><span className="sr-only">{t("loadingOverview")}</span></p>
      ) : null}
    </div>
  );

  const modeToggle = (
    <div role="radiogroup" aria-label={t("modeLabel")} className="grid grid-cols-2 border-b border-rule">
      {(["watched", "watching"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`-mb-px min-h-12 border-b-2 px-3 font-display text-lg transition-colors duration-150 ${mode === m ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
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
        <SaveBar><Submit label={t("setWatching")} pending={t("saving")} /></SaveBar>
      </form>
    );
  }

  const who = (value: boolean, Icon: typeof Users, label: string, hint: string) => (
    <label className="relative cursor-pointer">
      <input type="radio" name="isPrivate" value={value ? "on" : ""} checked={isPrivate === value} onChange={() => setIsPrivate(value)} className="peer sr-only" />
      <span className="grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border border-rule p-3 transition-colors duration-150 hover:border-muted peer-checked:border-accent peer-checked:bg-paper-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
        <Icon size={20} strokeWidth={1.6} aria-hidden="true" className="row-span-2 mt-0.5 text-accent" />
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={createLog} className="grid gap-6">
      {hidden}
      <input type="hidden" name="rating" value={rating} />
      {pickedCard}
      {modeToggle}

      <RatingField rating={rating} onChange={setRating} label={t("rating")} valueText={rating ? tf("rating", { stars: rating / 2 }) : t("noRating")} emptyText={t("noRating")} />

      <label className="field-label">
        {t("review")}
        <textarea name="review" rows={3} maxLength={4000} className="field" />
      </label>

      {/* Everything optional, folded: most viewings need none of it. */}
      <details className="group border-y border-rule" open={initialWith.length > 0}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 marker:content-none">
          <span className="grid">
            <span className="font-semibold">{t("details")}</span>
            <span className="text-sm text-muted">{t("detailsHint")}</span>
          </span>
          <ChevronDown size={20} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="grid gap-6 pb-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              {t("watchedOn")}
              <input type="date" name="watchedOn" defaultValue={today} max={today} required className="field tabular" />
            </label>
            <label className="field-label">
              {t("platform")}
              <input name="platform" maxLength={60} placeholder={t("platformPlaceholder")} autoComplete="off" className="field" />
            </label>
          </div>

          {picked.kind !== "movie" && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-2 text-sm text-ink-2">{t("episodeLogged")}</legend>
              <EpisodeFields key={picked.id + (limits ? "k" : "")} limits={limits} seasonName="season" episodeName="logEpisode" optionalSeasonLabel={t("seasonLogged")} />
            </fieldset>
          )}

          {detail && !detail.overview && (
            <label className="field-label">
              {t("overview")}
              <textarea name="overview" rows={3} maxLength={1200} placeholder={t("overviewPlaceholder")} className="field" />
            </label>
          )}

          <div className="grid">
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="containsSpoilers" className="size-5 shrink-0 accent-accent" />{t("spoilers")}</label>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="isRewatch" className="size-5 shrink-0 accent-accent" />{t("rewatch")}</label>
          </div>

          {members.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm text-ink-2">{t("with")}</legend>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <PersonChip key={m.id} name="watchedWith" value={m.id} user={m} defaultChecked={initialWith.includes(m.id)} />
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </details>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-ink-2">{t("who")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {who(false, Users, t("whoCircles"), t("whoCirclesHint", { circle: circleName }))}
          {who(true, Lock, t("whoMe"), t("whoMeHint"))}
        </div>
      </fieldset>

      <SaveBar><Submit label={isPrivate ? t("submitPrivate") : t("submit")} pending={t("saving")} /></SaveBar>
    </form>
  );
}

/** Keeps the save button in reach: stuck to the bottom of the screen, just above the tab bar, while the form scrolls. */
function SaveBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-rule bg-paper px-4 py-3 lg:bottom-0 lg:mx-0 lg:border-t-0 lg:px-0">
      {children}
    </div>
  );
}

function Submit({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button disabled={status.pending} className="btn btn-primary w-full">
      {status.pending ? pending : label}
    </button>
  );
}


/**
 * The rating, the form's signature: five 44px stars drawn over the native range input (0..10 half stars), which stays the
 * mechanism for pointer, touch and keyboard. The input is 22px wider than the stars and its thumb 22px wide, so a press on
 * a half star sets that half; the 22px before the first star is the "no rating" stop.
 * Under a mouse the stars preview the value the pointer is on (the left half of a star is a half star) and the number is
 * written beside them, so it is plain before clicking that half votes exist.
 */
export function RatingField({ rating, onChange, label, valueText, emptyText }: {
  rating: number; onChange: (rating: number) => void; label: string; valueText: string; emptyText: string;
}) {
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? rating;
  const number = (r: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: r % 2 ? 1 : 0 }).format(r / 2);
  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(Math.max(0, Math.min(10, Math.ceil((x - 22) / 22))));
  };
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-ink-2">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div onPointerMove={track} onPointerLeave={() => setHover(null)} className="group relative flex h-11 w-[242px] touch-manipulation items-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
          <span aria-hidden="true" className="grid h-11 w-[22px] shrink-0 place-items-center text-muted">
            <Minus size={14} strokeWidth={1.6} aria-hidden="true" />
          </span>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} aria-hidden="true" className="relative size-11 shrink-0">
              <Star fill="currentColor" strokeWidth={0} aria-hidden="true" className="size-11 text-rule" />
              {/* While the pointer is over the stars they show the value it is on; the saved one comes back when it leaves. */}
              <span className={`absolute inset-y-0 left-0 overflow-hidden ${hover !== null && hover !== rating ? "text-accent-hover" : "text-accent"}`} style={{ width: shown >= i * 2 ? "100%" : shown >= i * 2 - 1 ? "50%" : "0%" }}>
                <Star fill="currentColor" strokeWidth={0} aria-hidden="true" className="size-11 max-w-none" />
              </span>
            </span>
          ))}
          <input type="range" min={0} max={10} step={1} value={rating} onChange={(e) => onChange(Number(e.target.value))}
            aria-label={label} aria-valuetext={valueText}
            className="absolute inset-0 m-0 h-11 w-full cursor-pointer appearance-none opacity-0 [&::-moz-range-thumb]:size-[22px] [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:size-[22px] [&::-webkit-slider-thumb]:appearance-none" />
        </div>
        <span aria-hidden="true" className={`tabular min-w-[6ch] text-sm ${shown ? "text-ink" : "text-muted"}`}>
          {shown ? <><strong className="font-display text-2xl font-normal">{number(shown)}</strong> / 5</> : emptyText}
        </span>
      </div>
    </fieldset>
  );
}
