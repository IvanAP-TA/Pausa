"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CHUNK_LIMIT } from "@/lib/core/import";
import {
  ANILIST_LIST_QUERY, anilistRows, imdbRows, jikanRows, letterboxdList, letterboxdRows, letterboxdWatchlist, malRows, traktJsonRows,
  type AniListResponse, type ImdbSkipped, type ImportList, type ImportRow, type JikanPage, type LetterboxdFiles, type MalSkipped,
} from "@/lib/core/import-parsers";
import { importChunk, importListChunk, startImport } from "@/lib/import/actions";

type Source = "letterboxd" | "imdb" | "trakt" | "anilist" | "mal";
type Parsed = { rows: ImportRow[]; lists?: ImportList[]; undated: number; films?: number; skipped?: MalSkipped; imdbSkipped?: ImdbSkipped; titles?: boolean };
type Totals = { imported: number; alreadyHad: number; addedToCircle: number; newTitles: number; undatedSkipped: number; failed: number; lists: number; listItems: number };
/** Where an import goes: the person's own space, or one of their Cerchie (its id). */
const PRIVATE = "private";
/** Problems the screen can name. Anything else thrown while reading a file is "read". */
const KNOWN_ERRORS = ["not_found", "down", "imdbFormat", "imdbZip", "traktFormat", "traktJson", "letterboxdFormat"];

const SOURCES: Source[] = ["letterboxd", "imdb", "trakt", "anilist", "mal"];
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

/** The export's files plus its lists: watchlist.csv and lists/*.csv (or a list CSV picked on its own). */
async function readLetterboxd(files: File[]): Promise<{ files: LetterboxdFiles; lists: ImportList[] }> {
  const out: LetterboxdFiles = {};
  const lists: ImportList[] = [];
  const takeList = (name: string, text: string) => {
    const base = name.toLowerCase().split(/[\\/]/).pop() ?? "";
    const l = base === "watchlist.csv" ? letterboxdWatchlist(text) : letterboxdList(text);
    if (l) lists.push(l);
    return l !== null;
  };
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // "PK": a ZIP. Only files at its top level (not deleted/, lists/, likes/).
      const { unzipSync } = await import("fflate");
      for (const [path, data] of Object.entries(unzipSync(bytes))) {
        if (!path.toLowerCase().endsWith(".csv")) continue;
        if (path.toLowerCase().startsWith("lists/")) { takeList(path, decoder.decode(data)); continue; }
        if (path.includes("/")) continue; // deleted/, likes/, orphaned/
        const text = decoder.decode(data);
        if (path.toLowerCase() === "watchlist.csv") { takeList(path, text); continue; }
        const kind = classify(path, text);
        if (kind) out[kind] = text;
      }
    } else {
      const text = decoder.decode(bytes);
      if (takeList(f.name, text)) continue;
      const kind = classify(f.name, text);
      if (kind) out[kind] = text;
    }
  }
  return { files: out, lists };
}

async function readMal(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) { // gzip: MAL's export is a .xml.gz
    const { gunzipSync } = await import("fflate");
    return decoder.decode(gunzipSync(bytes));
  }
  return decoder.decode(bytes);
}

/**
 * Trakt's export: a ZIP whose JSON files sit in folders (watched/watched-movies.json, ratings/ratings-shows.json,
 * history/…), or those files picked loose. Every .json is handed over, wherever it is and whatever it is called: the
 * parser tells viewings and ratings from the rest by what the entries contain.
 */
async function readTrakt(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const { unzipSync } = await import("fflate");
      for (const [path, data] of Object.entries(unzipSync(bytes, { filter: (file) => file.name.toLowerCase().endsWith(".json") }))) {
        if (!path.split("/").pop()?.startsWith(".")) out.push(decoder.decode(data)); // not macOS "._file" leftovers
      }
    } else out.push(decoder.decode(bytes));
  }
  return out;
}

/** Jikan (api.jikan.moe) serves MyAnimeList's public lists with CORS, so the list goes browser to Jikan to us as plain rows. It allows ~3 requests a second: go gently, and wait when it says so. */
async function fetchJikan(userName: string): Promise<JikanPage[]> {
  const pages: JikanPage[] = [];
  for (let page = 1; page <= 40; page++) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`https://api.jikan.moe/v4/users/${encodeURIComponent(userName)}/animelist?status=completed&page=${page}`, { headers: { Accept: "application/json" } });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || res.status === 404 || res.status === 400) throw new Error("not_found");
    if (!res.ok) throw new Error("down");
    const json = (await res.json()) as JikanPage;
    pages.push(json);
    if (!json.pagination?.has_next_page) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return pages;
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

export function ImportClient({ circles, tmdb }: { circles: { id: string; name: string }[]; tmdb: boolean }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const [source, setSource] = useState<Source>("letterboxd");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState(true);
  const [undated, setUndated] = useState(false);
  const [withLists, setWithLists] = useState(true);
  const [dest, setDest] = useState<string>(PRIVATE); // the personal space unless the person picks a Cerchia
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [username, setUsername] = useState("");
  const [malMode, setMalMode] = useState<"user" | "file">("user");
  const stop = useRef(false);

  const reset = () => { setParsed(null); setError(null); setTotals(null); setProgress(null); };
  const choose = (s: Source) => { if (!busy) { setSource(s); reset(); } };

  async function load(task: () => Promise<Parsed>) {
    reset(); setBusy(true);
    try {
      const p = await task();
      if (p.rows.length === 0 && !p.lists?.length) setError("empty"); else setParsed(p);
    } catch (e) {
      const known = e instanceof Error && KNOWN_ERRORS.includes(e.message) ? e.message : null;
      const base = source === "mal" ? "mal" : "anilist";
      setError(known === "not_found" ? `${base}NotFound` : known === "down" ? `${base}Down` : known ?? "read");
    } finally { setBusy(false); }
  }

  const onLetterboxd = (files: FileList | null) => files?.length && load(async () => {
    const read = await readLetterboxd([...files]);
    // Files were picked, and none is a Letterboxd export (no diary, ratings, reviews, watched, watchlist or list).
    if (Object.keys(read.files).length === 0 && read.lists.length === 0) throw new Error("letterboxdFormat");
    const { rows, films, undated } = letterboxdRows(read.files);
    return { rows, films, undated, lists: read.lists };
  });
  const onImdb = (files: FileList | null) => files?.[0] && load(async () => {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error("imdbZip"); // IMDb gives a plain .csv
    const { rows, undated, skipped, recognized } = imdbRows(decoder.decode(bytes));
    if (!recognized) throw new Error("imdbFormat");
    return { rows, undated, imdbSkipped: skipped, titles: true };
  });
  const onTrakt = (files: FileList | null) => files?.length && load(async () => {
    const { rows, undated, recognized, broken } = traktJsonRows(await readTrakt([...files]));
    if (!recognized) throw new Error(broken > 0 ? "traktJson" : "traktFormat");
    return { rows, undated, titles: true };
  });
  const onJikan = () => username.trim() && load(async () => {
    const { rows, undated } = jikanRows(await fetchJikan(username.trim()));
    return { rows, undated };
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
    const size = Math.min(CHUNK_LIMIT, rows[0]?.kind === "anime" ? 30 : 20); // films and series also trigger a TMDB lookup each
    const sum: Totals = { imported: 0, alreadyHad: 0, addedToCircle: 0, newTitles: 0, undatedSkipped: 0, failed: 0, lists: 0, listItems: 0 };
    const lists = withLists ? parsed.lists ?? [] : [];
    const total = rows.length + lists.reduce((n, l) => n + l.rows.length, 0);
    let failures = 0;

    // The run is opened first: the server fixes where it goes, and every chunk below only names the run.
    const started = await startImport({ source, circleId: dest === PRIVATE ? null : dest }).catch(() => null);
    if (!started?.ok) { setError(started?.error === "limit" ? "limit" : "chunk"); setBusy(false); return; }
    const batchId = started.batchId;
    setProgress({ done: 0, total });
    let limited = false;

    for (let i = 0; i < rows.length && !stop.current; i += size) {
      const part = rows.slice(i, i + size).map((r) => ({
        source: r.source, kind: r.kind, title: r.title, year: r.year, rating: r.rating, watchedOn: r.watchedOn, rewatch: r.rewatch,
        review: reviews ? r.review : null, letterboxdUri: r.letterboxdUri ?? null, anilistId: r.anilistId ?? null, malId: r.malId ?? null,
        imdbId: r.imdbId ?? null, tmdbId: r.tmdbId ?? null,
      }));
      const chunk = { batchId, rows: part, includeReviews: reviews, includeUndated: undated, locale };
      let res = await importChunk(chunk).catch(() => null);
      if (!res?.ok && res?.error !== "limit") res = await importChunk(chunk).catch(() => null); // one retry
      if (res?.ok) {
        failures = 0;
        sum.imported += res.imported; sum.alreadyHad += res.alreadyHad; sum.addedToCircle += res.addedToCircle; sum.newTitles += res.newTitles; sum.undatedSkipped += res.undatedSkipped; sum.failed += res.invalid;
      } else {
        sum.failed += part.length;
        if (res?.error === "limit") { limited = true; setError("limit"); break; } // the hourly ceiling: the rest waits
        if (++failures >= 3) { setError("chunk"); break; } // signed out, offline, server down: stop instead of failing every row
      }
      setProgress({ done: Math.min(i + size, rows.length), total });
    }

    // Lists and watchlist, in chunks of 20 films (each may trigger a TMDB lookup).
    let doneLists = 0;
    let before = rows.length;
    for (const l of lists) {
      if (stop.current || failures >= 3 || limited) break;
      let ok = true;
      for (let i = 0; i < l.rows.length && !stop.current; i += 20) {
        const part = l.rows.slice(i, i + 20).map((r) => ({
          source: r.source, kind: r.kind, title: r.title, year: r.year, rating: null, watchedOn: null, rewatch: false, review: null, letterboxdUri: r.letterboxdUri ?? null,
        }));
        const payload = { name: l.name, description: l.description, kind: l.kind, batchId, offset: i, rows: part, locale };
        let res = await importListChunk(payload).catch(() => null);
        if (!res?.ok && res?.error !== "limit") res = await importListChunk(payload).catch(() => null); // one retry
        if (res?.ok) { failures = 0; sum.listItems += res.added; sum.newTitles += res.newTitles; sum.failed += res.invalid; }
        else {
          ok = false; sum.failed += part.length;
          if (res?.error === "limit") { limited = true; setError("limit"); break; }
          if (++failures >= 3) { setError("chunk"); break; }
        }
        setProgress({ done: Math.min(before + i + 20, total), total });
      }
      before += l.rows.length;
      if (ok) doneLists++;
    }
    sum.lists = doneLists;
    setTotals(sum); setBusy(false);
  }

  // A choice cell: a square 1px rule border, amber when chosen.
  const cell = (on: boolean) => `min-h-11 border px-2 text-sm font-semibold transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-accent text-ink" : "border-rule text-ink-2 hover:border-muted hover:text-ink"}`;
  // The drop zone: a dashed rectangle on the ground, the file input inside it.
  const drop = "grid gap-3 border border-dashed border-muted p-5 text-sm text-ink-2 transition-colors duration-150 hover:border-ink";
  const file = "w-full min-w-0 text-base text-ink disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:min-h-11 file:cursor-pointer file:border file:border-solid file:border-ink file:bg-transparent file:px-4 file:font-display file:text-lg file:uppercase file:text-ink";
  const row = "flex min-h-11 cursor-pointer items-center justify-between gap-4 py-3";
  const check = "size-5 shrink-0 accent-[var(--color-accent)]";
  // A list in the messages; read defensively, so a malformed translation can never take the whole screen down.
  const rawSteps: unknown = source === "anilist" ? [] : t.raw(`${source}.steps`);
  const steps = (Array.isArray(rawSteps) ? rawSteps : rawSteps && typeof rawSteps === "object" ? Object.values(rawSteps) : []).filter((x): x is string => typeof x === "string");
  const destCircle = circles.find((c) => c.id === dest) ?? null;
  const listCount = (parsed?.lists ?? []).reduce((n, l) => n + l.rows.length, 0);
  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  // Each result line opens with its count: the count is set as a figure, the rest of the line is its label.
  const label = (line: string) => line.replace(/^[\d.,'\s  ]+/, "");
  const results: { key: string; n: number; text: string; strong?: boolean }[] = [];
  if (totals) {
    if (totals.addedToCircle > 0 && destCircle) results.push({ key: "inCircle", n: totals.addedToCircle, text: t("done.inCircle", { count: totals.addedToCircle, circle: destCircle.name }) });
    if (totals.lists > 0) results.push({ key: "lists", n: totals.lists, text: t("done.lists", { count: totals.lists, items: totals.listItems }) });
    if (totals.newTitles > 0) results.push({ key: "newTitles", n: totals.newTitles, text: t("done.newTitles", { count: totals.newTitles }) });
    if (totals.alreadyHad > 0) results.push({ key: "alreadyHad", n: totals.alreadyHad, text: t("done.alreadyHad", { count: totals.alreadyHad }) });
    if (totals.undatedSkipped > 0) results.push({ key: "undated", n: totals.undatedSkipped, text: t("done.undated", { count: totals.undatedSkipped }) });
    if (totals.failed > 0) results.push({ key: "failed", n: totals.failed, text: t("done.failed", { count: totals.failed }), strong: true });
  }

  return (
    <div className="grid gap-8">
      <div role="tablist" aria-label={t("title")} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {SOURCES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={source === s} disabled={busy} onClick={() => choose(s)} className={cell(source === s)}>
            {t(`tabs.${s}`)}
          </button>
        ))}
      </div>

      {!totals && (
        <section className="grid gap-4" aria-labelledby="how-to">
          <h2 id="how-to" className="title">{t(`${source}.title`)}</h2>
          {source === "anilist" ? (
            <p className="text-ink-2">{t("anilist.body")}</p>
          ) : source === "mal" ? (
            <div role="radiogroup" aria-label={t("mal.mode")} className="grid grid-cols-2 gap-2">
              {(["user", "file"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={malMode === m} disabled={busy} onClick={() => { setMalMode(m); reset(); }} className={cell(malMode === m)}>{t(`mal.mode_${m}`)}</button>
              ))}
            </div>
          ) : null}
          {source === "mal" && malMode === "user" ? <p className="text-ink-2">{t("mal.userBody")}</p>
            : source !== "anilist" && <ol className="grid list-decimal gap-2 pl-5 text-ink-2 marker:tabular-nums marker:text-muted">{steps.map((s) => <li key={s}>{s}</li>)}</ol>}

          {source === "letterboxd" && (
            <>
              {!tmdb && <p className="text-sm text-muted">{t("letterboxd.noCovers")}</p>}
              <label className={drop}>{t("letterboxd.pick")}
                <input type="file" accept=".zip,.csv,application/zip,text/csv" multiple disabled={busy} className={file} onChange={(e) => onLetterboxd(e.target.files)} />
              </label>
            </>
          )}
          {source === "imdb" && (
            <label className={drop}>{t("imdb.pick")}
              <input type="file" accept=".csv,text/csv" disabled={busy} className={file} onChange={(e) => onImdb(e.target.files)} />
            </label>
          )}
          {source === "trakt" && (
            <label className={drop}>{t("trakt.pick")}
              <input type="file" accept=".zip,.json,application/zip,application/json" multiple disabled={busy} className={file} onChange={(e) => onTrakt(e.target.files)} />
            </label>
          )}
          {source === "mal" && malMode === "user" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onJikan(); }}>
              <label className="sr-only" htmlFor="mal-user">{t("mal.user")}</label>
              <input id="mal-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("mal.user")} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="field flex-1" />
              <button disabled={busy || !username.trim()} className="btn shrink-0">{t("anilist.find")}</button>
            </form>
          )}
          {source === "mal" && malMode === "file" && (
            <label className={drop}>{t("mal.pick")}
              <input type="file" accept=".xml,.gz,application/xml,application/gzip,text/xml" disabled={busy} className={file} onChange={(e) => onMal(e.target.files)} />
            </label>
          )}
          {source === "anilist" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAniList(); }}>
              <label className="sr-only" htmlFor="al-user">{t("anilist.user")}</label>
              <input id="al-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("anilist.user")} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                className="field flex-1" />
              <button disabled={busy || !username.trim()} className="btn shrink-0">{t("anilist.find")}</button>
            </form>
          )}
        </section>
      )}

      <div aria-live="polite" className="grid gap-4">
        {busy && !progress && <p className="text-sm text-muted">{t("reading")}</p>}
        {error && <p role="alert" className="border border-error p-3 text-sm text-error">{t(`errors.${error}`)}</p>}

        {parsed && !totals && (
          <section className="plate grid gap-4 pt-6">
            {parsed.rows.length > 0 && <p className="title tabular">
              {parsed.films !== undefined
                ? t("found.films", { films: parsed.films, views: parsed.rows.length })
                : parsed.titles ? t("found.titles", { count: parsed.rows.length }) : t("found.anime", { count: parsed.rows.length })}
            </p>}
            {parsed.skipped && (parsed.skipped.watching + parsed.skipped.planned + parsed.skipped.onHold + parsed.skipped.dropped) > 0 && (
              <p className="text-sm text-muted">{t("found.skipped", parsed.skipped)}</p>
            )}
            {parsed.imdbSkipped && parsed.imdbSkipped.episodes + parsed.imdbSkipped.other > 0 && (
              <p className="text-sm text-muted">{t("found.imdbSkipped", parsed.imdbSkipped)}</p>
            )}

            {/* Where it goes: asked every time, before anything is written. The personal space is the safe default. */}
            <fieldset className="grid gap-1" disabled={busy}>
              <legend className="mb-1 font-semibold">{t("dest.legend")}</legend>
              <div className="rows grid">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-3">
                  <input type="radio" name="import-dest" value={PRIVATE} checked={dest === PRIVATE} onChange={() => setDest(PRIVATE)} className={check} />
                  <span className="min-w-0">{t("dest.private")}<span className="mt-0.5 block text-sm text-muted">{t("dest.privateHint")}</span></span>
                </label>
                {circles.map((c) => (
                  <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-3">
                    <input type="radio" name="import-dest" value={c.id} checked={dest === c.id} onChange={() => setDest(c.id)} className={check} />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{t("dest.circle", { circle: c.name })}<span className="mt-0.5 block text-sm text-muted">{t("dest.circleHint")}</span></span>
                  </label>
                ))}
              </div>
              {destCircle && <p role="status" className="well mt-2 p-3 text-sm text-ink-2">{t("dest.warning", { count: parsed.rows.length + (withLists ? listCount : 0), circle: destCircle.name })}</p>}
            </fieldset>

            <div className="rows grid">
              {parsed.lists && parsed.lists.length > 0 && (
                <div className="grid">
                  <label className={row}>
                    <span className="min-w-0">{t("lists.include", { count: parsed.lists.length, items: parsed.lists.reduce((n, l) => n + l.rows.length, 0) })}
                      <span className="mt-0.5 block text-sm text-muted [overflow-wrap:anywhere]">{parsed.lists.map((l) => l.name).join(", ")}</span></span>
                    <input type="checkbox" checked={withLists} disabled={busy} onChange={(e) => setWithLists(e.target.checked)} className={check} />
                  </label>
                  {withLists && <p className="pb-3 text-sm text-muted">{destCircle ? t("lists.scope_group") : t("lists.scope_personal")}</p>}
                </div>
              )}
              {parsed.rows.length > 0 && <label className={row}>
                {t("options.reviews")}
                <input type="checkbox" checked={reviews} disabled={busy} onChange={(e) => setReviews(e.target.checked)} className={check} />
              </label>}
              {parsed.undated > 0 && (
                <label className={row}>
                  <span>{t("options.undated", { count: parsed.undated })}<span className="mt-0.5 block text-sm text-muted">{t("options.undatedHint")}</span></span>
                  <input type="checkbox" checked={undated} disabled={busy} onChange={(e) => setUndated(e.target.checked)} className={check} />
                </label>
              )}
            </div>
            {progress ? (
              <div className="grid gap-3">
                <p className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="figure text-display">{progress.done}</span>
                  <span className="tabular text-sm text-muted">{t("progress", { done: progress.done, total: progress.total })}</span>
                </p>
                <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress", { done: progress.done, total: progress.total })} className="meter">
                  <span className="transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${percent / 100})` }} />
                </div>
              </div>
            ) : (
              <button type="button" onClick={run} disabled={busy || (parsed.rows.length === 0 && !withLists)} className="btn btn-primary w-full">
                {parsed.rows.length === 0 ? t("lists.run", { count: listCount }) : t("run", { count: parsed.rows.length + (withLists ? listCount : 0) })}
              </button>
            )}
          </section>
        )}

        {totals && (
          <section className="well grained grid gap-5 p-5">
            <h2 className="title tabular">{totals.imported === 0 && totals.lists > 0 ? t("done.listsOnly") : t("done.title", { count: totals.imported })}</h2>
            {results.length > 0 && (
              <ul className="rows grid">
                {results.map((r) => (
                  <li key={r.key} className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] items-baseline gap-4 py-3">
                    <span className="figure text-display">{r.n}</span>
                    <span className={`text-sm ${r.strong ? "text-ink" : "text-muted"}`}>{label(r.text)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {destCircle
                ? <Link href={`/c/${destCircle.id}`} className="btn btn-primary">{t("done.toCircle", { circle: destCircle.name })}</Link>
                : <Link href="/me?only=private" className="btn btn-primary">{t("done.toSpace")}</Link>}
              {totals.lists > 0 && destCircle && <Link href={`/c/${destCircle.id}/lists`} className="btn">{t("done.toLists")}</Link>}
              <button type="button" onClick={reset} className="btn btn-quiet">{t("done.again")}</button>
            </div>
            {destCircle && <p className="text-sm text-muted">{t.rich("done.undo", { link: (chunks) => <Link href="/me/imports" className="link">{chunks}</Link> })}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
