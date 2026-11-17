"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addToList, searchMedia } from "@/lib/actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";

/** Adds any title to a list without going through a log: search, tap. */
export function ListAdd({ listId }: { listId: string }) {
  const t = useTranslations("manage");
  const tl = useTranslations("lists");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) start(async () => setResults(await searchMedia(query, locale)));
  }
  function add(m: MediaSummary) {
    const fd = new FormData();
    fd.set("listId", listId);
    fd.set("mediaId", m.id);
    start(async () => {
      await addToList(fd);
      setAdded((s) => new Set(s).add(m.id));
    });
  }

  return (
    <div className="grid gap-2">
      <form onSubmit={search} role="search" className="flex gap-2">
        <label htmlFor={`q-${listId}`} className="sr-only">{t("addTitle")}</label>
        <input id={`q-${listId}`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("addTitle")}
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-rule bg-paper px-3 text-sm placeholder:text-muted/70" />
        <button disabled={pending} className="min-h-11 shrink-0 rounded-full border border-rule px-4 text-sm font-semibold hover:bg-paper-3 disabled:opacity-60">{tl("add")}</button>
      </form>
      {results?.length === 0 && <p className="text-xs text-muted">{t("noResults")}</p>}
      {results && results.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {results.slice(0, 8).map((m) => (
            <li key={m.id}>
              <button type="button" disabled={added.has(m.id) || pending} onClick={() => add(m)} className="relative grid w-full gap-1 text-left disabled:opacity-50">
                <Poster media={m} size="sm" />
                <span className="line-clamp-2 text-[11px] leading-tight">{m.title}</span>
                {added.has(m.id) && <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-second text-[11px] text-on-second" aria-label={t("added")}>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
