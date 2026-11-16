"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CHUNK_LIMIT } from "@/lib/core/import";
import {
  ANILIST_LIST_QUERY, anilistRows, letterboxdRows, malRows, type AniListResponse, type ImportRow, type LetterboxdFiles, type MalSkipped,
} from "@/lib/core/import-parsers";
import { importChunk } from "@/lib/import/actions";

type Source = "letterboxd" | "anilist" | "mal";
type Parsed = { rows: ImportRow[]; undated: number; films?: number; skipped?: MalSkipped };
type Totals = { imported: number; alreadyHad: number; newTitles: number; undatedSkipped: number; failed: number };

const SOURCES: Source[] = ["letterboxd", "anilist", "mal"];
const decoder = new TextDecoder("utf-8");

/** Which Letterboxd export file is this? By name, or by its header line if the file was renamed. */
function classify(name: string, text: string): keyof LetterboxdFiles | null {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? "";
  if (base === "diary.csv") return "diary";
  if (base === "ratings.csv") return "ratings";
  if (base === "reviews.csv") return "reviews";
  if (base === "watched.csv") return "watched";
  const head = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (!head.includes("Letterboxd URI")) return null;
  if (head.includes("Review")) return "reviews";
  if (head.includes("Watched Date")) return "diary";
  if (head.includes("Rating")) return "ratings";
  return "watched";
}

async function readLetterboxd(files: File[]): Promise<LetterboxdFiles> {
  const out: LetterboxdFiles = {};
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // "PK": a ZIP. Only files at its top level (not deleted/, lists/, likes/).
      const { unzipSync } = await import("fflate");
      for (const [path, data] of Object.entries(unzipSync(bytes))) {
        if (path.includes("/") || !path.toLowerCase().endsWith(".csv")) continue;
        const text = decoder.decode(data);
        const kind = classify(path, text);
        if (kind) out[kind] = text;
      }
    } else {
      const text = decoder.decode(bytes);
      const kind = classify(f.name, text);
      if (kind) out[kind] = text;
    }
  }
  return out;
}

async function readMal(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) { // gzip: MAL's export is a .xml.gz
    const { gunzipSync } = await import("fflate");
    return decoder.decode(gunzipSync(bytes));
  }
  return decoder.decode(bytes);
}

/** AniList's public API allows requests straight from the browser, so the list never passes through our server. */
async function fetchAniList(userName: string): Promise<AniListResponse[]> {
  const pages: AniListResponse[] = [];
  for (let chunk = 1; chunk <= 12; chunk++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: ANILIST_LIST_QUERY, variables: { userName, chunk } }),
    });
    if (res.status === 404) throw new Error("not_found");
    if (!res.ok) throw new Error("down");
    const json = (await res.json()) as AniListResponse;
    pages.push(json);
    if (!json.data?.MediaListCollection?.hasNextChunk) break;
  }
  return pages;
}

export function ImportClient({ circleId, tmdb }: { circleId: string; tmdb: boolean }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const [source, setSource] = useState<Source>("letterboxd");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState(true);
  const [undated, setUndated] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [username, setUsername] = useState("");
  const stop = useRef(false);

  const reset = () => { setParsed(null); setError(null); setTotals(null); setProgress(null); };
  const choose = (s: Source) => { if (!busy) { setSource(s); reset(); } };

  async function load(task: () => Promise<Parsed>) {
    reset(); setBusy(true);
    try {
      const p = await task();
      if (p.rows.length === 0) setError("empty"); else setParsed(p);
    } catch (e) {
      setError(e instanceof Error && ["not_found", "down"].includes(e.message) ? (e.message === "not_found" ? "anilistNotFound" : "anilistDown") : "read");
    } finally { setBusy(false); }
  }

  const onLetterboxd = (files: FileList | null) => files?.length && load(async () => {
    const { rows, films, undated } = letterboxdRows(await readLetterboxd([...files]));
    return { rows, films, undated };
  });
  const onMal = (files: FileList | null) => files?.[0] && load(async () => {
    const { rows, skipped, undated } = malRows(await readMal(files[0]));
    return { rows, skipped, undated };
  });
  const onAniList = () => username.trim() && load(async () => {
    const { rows, undated } = anilistRows(await fetchAniList(username.trim()));
    return { rows, undated };
  });

  async function run() {
    if (!parsed) return;
    stop.current = false; setBusy(true); setError(null);
    const rows = parsed.rows;
    const size = Math.min(CHUNK_LIMIT, rows[0]?.kind === "movie" ? 20 : 30); // films also trigger a TMDB lookup each
    const sum: Totals = { imported: 0, alreadyHad: 0, newTitles: 0, undatedSkipped: 0, failed: 0 };
    setProgress({ done: 0, total: rows.length });
    let failures = 0;

    for (let i = 0; i < rows.length && !stop.current; i += size) {
      const part = rows.slice(i, i + size).map((r) => ({
        source: r.source, kind: r.kind, title: r.title, year: r.year, rating: r.rating, watchedOn: r.watchedOn, rewatch: r.rewatch,
        review: reviews ? r.review : null, letterboxdUri: r.letterboxdUri ?? null, anilistId: r.anilistId ?? null, malId: r.malId ?? null,
      }));
      let res = await importChunk({ rows: part, includeReviews: reviews, includeUndated: undated, locale }).catch(() => null);
      if (!res?.ok) res = await importChunk({ rows: part, includeReviews: reviews, includeUndated: undated, locale }).catch(() => null); // one retry
      if (res?.ok) {
        failures = 0;
        sum.imported += res.imported; sum.alreadyHad += res.alreadyHad; sum.newTitles += res.newTitles; sum.undatedSkipped += res.undatedSkipped; sum.failed += res.invalid;
      } else {
        sum.failed += part.length;
        if (++failures >= 3) { setError("chunk"); break; } // signed out, offline, server down: stop instead of failing every row
      }
      setProgress({ done: Math.min(i + size, rows.length), total: rows.length });
    }
    setTotals(sum); setBusy(false);
  }

  const field = "min-h-12 w-full rounded-sm border border-rule bg-paper-2 px-3 text-ink file:mr-3 file:rounded-full file:border-0 file:bg-paper-3 file:px-4 file:py-2 file:text-sm file:font-semibold";
  const steps = t.raw(`${source}.steps`) as string[];
  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label={t("title")} className="grid grid-cols-3 rounded-full border border-rule bg-paper-2 p-1 text-sm">
        {SOURCES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={source === s} disabled={busy} onClick={() => choose(s)}
            className={`min-h-10 rounded-full px-2 font-semibold transition-colors ${source === s ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`}>
            {t(`tabs.${s}`)}
          </button>
        ))}
      </div>

      {!totals && (
        <section className="grid gap-4" aria-labelledby="how-to">
          <h2 id="how-to" className="font-display text-xl leading-tight">{t(`${source}.title`)}</h2>
          {source !== "anilist" ? (
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
          ) : (
            <p className="text-sm text-muted">{t("anilist.body")}</p>
          )}

          {source === "letterboxd" && (
            <>
              {!tmdb && <p className="text-xs text-muted">{t("letterboxd.noCovers")}</p>}
              <label className="grid gap-1.5 text-sm text-muted">{t("letterboxd.pick")}
                <input type="file" accept=".zip,.csv,application/zip,text/csv" multiple disabled={busy} className={field} onChange={(e) => onLetterboxd(e.target.files)} />
              </label>
            </>
          )}
          {source === "mal" && (
            <label className="grid gap-1.5 text-sm text-muted">{t("mal.pick")}
              <input type="file" accept=".xml,.gz,application/xml,application/gzip,text/xml" disabled={busy} className={field} onChange={(e) => onMal(e.target.files)} />
            </label>
          )}
          {source === "anilist" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAniList(); }}>
              <label className="sr-only" htmlFor="al-user">{t("anilist.user")}</label>
              <input id="al-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("anilist.user")} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="min-h-12 min-w-0 flex-1 rounded-sm border border-rule bg-paper-2 px-3" />
              <button disabled={busy || !username.trim()} className="min-h-12 shrink-0 rounded-full border border-rule bg-paper-3 px-5 font-semibold hover:bg-rule disabled:opacity-50">{t("anilist.find")}</button>
            </form>
          )}
        </section>
      )}

      <div aria-live="polite" className="grid gap-4">
        {busy && !progress && <p className="text-sm text-muted">{t("reading")}</p>}
        {error && <p role="alert" className="rounded-md border border-accent p-3 text-sm text-accent">{t(`errors.${error}`)}</p>}

        {parsed && !totals && (
          <section className="grid gap-4 rounded-md border border-rule bg-paper-2 p-4">
            <p className="font-semibold">
              {parsed.films !== undefined
                ? t("found.films", { films: parsed.films, views: parsed.rows.length })
                : t("found.anime", { count: parsed.rows.length })}
            </p>
            {parsed.skipped && (parsed.skipped.watching + parsed.skipped.planned + parsed.skipped.onHold + parsed.skipped.dropped) > 0 && (
              <p className="text-sm text-muted">{t("found.skipped", parsed.skipped)}</p>
            )}
            <label className="flex min-h-9 items-center gap-3 text-sm">
              <input type="checkbox" checked={reviews} disabled={busy} onChange={(e) => setReviews(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
              {t("options.reviews")}
            </label>
            {parsed.undated > 0 && (
              <label className="flex min-h-9 items-start gap-3 text-sm">
                <input type="checkbox" checked={undated} disabled={busy} onChange={(e) => setUndated(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>{t("options.undated", { count: parsed.undated })}<span className="mt-0.5 block text-xs text-muted">{t("options.undatedHint")}</span></span>
              </label>
            )}
            {progress ? (
              <div className="grid gap-2">
                <progress value={percent} max={100} aria-label={t("progress", { done: progress.done, total: progress.total })} className="h-2 w-full overflow-hidden rounded-full accent-[var(--color-accent)]" />
                <p className="tabular text-sm text-muted">{t("progress", { done: progress.done, total: progress.total })}</p>
              </div>
            ) : (
              <button type="button" onClick={run} disabled={busy} className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
                {t("run", { count: parsed.rows.length })}
              </button>
            )}
          </section>
        )}

        {totals && (
          <section className="grid gap-4 rounded-md bg-second-deep p-5 text-on-second">
            <h2 className="font-display text-2xl leading-tight">{t("done.title", { count: totals.imported })}</h2>
            <ul className="grid gap-1 text-sm text-on-second-muted">
              {totals.newTitles > 0 && <li>{t("done.newTitles", { count: totals.newTitles })}</li>}
              {totals.alreadyHad > 0 && <li>{t("done.alreadyHad", { count: totals.alreadyHad })}</li>}
              {totals.undatedSkipped > 0 && <li>{t("done.undated", { count: totals.undatedSkipped })}</li>}
              {totals.failed > 0 && <li className="text-on-second">{t("done.failed", { count: totals.failed })}</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href={`/c/${circleId}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">{t("done.toDiary")}</Link>
              <Link href={`/c/${circleId}/insights`} className="inline-flex min-h-11 items-center rounded-full border border-on-second-muted/50 px-5 text-sm hover:bg-paper/10">{t("done.toInsights")}</Link>
              <button type="button" onClick={reset} className="min-h-11 rounded-full px-4 text-sm text-on-second-muted underline underline-offset-4 hover:text-on-second">{t("done.again")}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
