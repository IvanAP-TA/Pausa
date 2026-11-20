"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addToList, searchMedia } from "@/lib/actions";
import type { MediaSummary } from "@/lib/data";
import { Poster } from "@/components/poster";
import { Check } from "lucide-react";

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
    <div className="grid gap-3">
      <form onSubmit={search} role="search" className="grid gap-2">
        <label htmlFor={`q-${listId}`} className="field-label">{t("addTitle")}</label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input id={`q-${listId}`} value={query} onChange={(e) => setQuery(e.target.value)} className="field" />
          <button disabled={pending} className="btn w-full sm:w-fit">{tl("add")}</button>
        </div>
      </form>
      {results?.length === 0 && <p className="text-sm text-muted">{t("noResults")}</p>}
      {results && results.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {results.slice(0, 8).map((m) => (
            <li key={m.id} className="min-w-0">
              <button type="button" disabled={added.has(m.id) || pending} onClick={() => add(m)}
                className="group relative grid w-full gap-2 text-left transition-opacity duration-150 hover:opacity-80 active:translate-y-px disabled:opacity-50">
                <Poster media={m} size="sm" />
                <span className="line-clamp-2 text-sm leading-snug underline-offset-4 [overflow-wrap:anywhere] group-hover:underline">{m.title}</span>
                {added.has(m.id) && (
                  <span className="absolute right-0 top-0 grid size-6 place-items-center bg-accent text-accent-ink" aria-label={t("added")}>
                    <Check size={16} strokeWidth={1.6} aria-hidden="true" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
