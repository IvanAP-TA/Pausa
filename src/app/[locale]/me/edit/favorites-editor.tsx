"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Search, X } from "lucide-react";
import { searchMedia } from "@/lib/actions";
import { addFavoriteAction, removeFavoriteAction } from "@/lib/profile-actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";

type Fav = { id: string; title: string; posterPath: string | null };

/** The shelf of favourite titles: search as you type, tap to pin, the cross to take one off. Saved at once, no form. */
export function FavoritesEditor({ initial, max }: { initial: Fav[]; max: number }) {
  const t = useTranslations("profile");
  const tl = useTranslations("log");
  const tk = useTranslations("kind");
  const locale = useLocale();
  const [favs, setFavs] = useState<Fav[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [, startSave] = useTransition();
  const [full, setFull] = useState(false);

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

  function add(m: MediaSummary) {
    if (favs.some((f) => f.id === m.id)) return;
    if (favs.length >= max) { setFull(true); return; }
    setFull(false);
    setFavs((cur) => [...cur, { id: m.id, title: m.title, posterPath: m.posterPath ?? null }]);
    const fd = new FormData(); fd.set("mediaId", m.id);
    startSave(async () => { const res = await addFavoriteAction(fd); if ("error" in res) setFull(true); });
  }
  function remove(id: string) {
    setFull(false);
    setFavs((cur) => cur.filter((f) => f.id !== id));
    const fd = new FormData(); fd.set("mediaId", id);
    startSave(async () => { await removeFavoriteAction(fd); });
  }

  const shown = query.trim().length >= 2 ? results ?? [] : [];

  return (
    <div className="grid gap-5">
      {favs.length > 0 && (
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {favs.map((f) => (
            <li key={f.id} className="relative grid min-w-0 content-start gap-1.5">
              <Poster media={f} />
              <span className="line-clamp-2 text-sm leading-tight text-ink-2 [overflow-wrap:anywhere]">{f.title}</span>
              <button type="button" onClick={() => remove(f.id)} aria-label={t("removeFavorite", { title: f.title })}
                className="absolute right-0 top-0 grid size-11 place-items-center bg-paper/85 text-ink transition-colors duration-150 hover:text-error">
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <p aria-live="polite" className="text-sm text-muted">{full ? t("full", { max: max }) : t("count", { count: favs.length, max: max })}</p>

      <div className="relative">
        <label htmlFor="fav-q" className="sr-only">{t("searchFavorite")}</label>
        <Search size={20} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input id="fav-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchFavorite")}
          enterKeyHint="search" autoComplete="off" spellCheck={false} className="field w-full pl-12" />
      </div>
      {searching && shown.length === 0 && <p className="text-sm text-muted">{tl("searching")}</p>}
      {shown.length > 0 && (
        <ul className={`rows grid transition-opacity duration-150 ${searching ? "opacity-60" : ""}`}>
          {shown.slice(0, 8).map((m) => {
            const pinned = favs.some((f) => f.id === m.id);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => add(m)} disabled={pinned} aria-label={pinned ? undefined : t("addFavorite", { title: m.title })}
                  className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left transition-colors duration-150 hover:bg-paper-2 disabled:opacity-50">
                  <Poster media={m} size="sm" />
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">{m.title}</span>
                    <span className="text-sm text-muted">{[m.year, tk(m.kind)].filter(Boolean).join(", ")}</span>
                  </span>
                  <Plus size={20} strokeWidth={1.8} aria-hidden="true" className="text-accent" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
