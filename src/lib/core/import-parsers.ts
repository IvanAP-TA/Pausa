/* Parsers for history imports. Pure functions (no I/O), shared by the browser and the server.
 *   - Letterboxd: the CSV files of "Settings → Data → Export your data" (diary, ratings, reviews, watched).
 *   - MyAnimeList: the XML export ("animelist_….xml", optionally .gz, unzipped by the caller).
 *   - AniList: the response of its public GraphQL API for a username (see ANILIST_LIST_QUERY).
 * Ratings come out on the app's scale: half-stars 1..10 (10 = 5 stars). Dates are YYYY-MM-DD, or null when unknown. */

export type ImportSource = "letterboxd" | "anilist" | "mal" | "imdb" | "trakt";

export type ImportRow = {
  source: ImportSource;
  kind: "movie" | "tv" | "anime";
  title: string;
  year: number | null;
  rating: number | null; // 1..10
  watchedOn: string | null; // YYYY-MM-DD; null = the source has no date for it
  rewatch: boolean;
  review: string | null;
  // Identity in the source, used to recognise the same title again (and to avoid duplicates on re-import).
  letterboxdUri?: string | null;
  anilistId?: number | null;
  malId?: number | null;
  imdbId?: string | null; // "tt1234567"
  // Filled in by enrichment (TMDB / AniList), all optional.
  tmdbId?: number | null;
  originalTitle?: string | null;
  posterPath?: string | null; // TMDB path or a full https URL
  runtimeMin?: number | null;
  titles?: Partial<Record<"it" | "en" | "es", string>>;
};

/* ───────────── CSV ───────────── */

/** RFC 4180: quoted fields, "" as an escaped quote, commas and newlines inside quotes, optional BOM. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }

  const [header, ...body] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? "").trim()])));
}

/* ───────────── helpers ───────────── */

const toYear = (v: string | undefined) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 1800 && n < 2200 ? n : null;
};
const isoDate = (v: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") && !(v ?? "").startsWith("0000") ? (v as string) : null);
const pad = (n: number) => String(n).padStart(2, "0");

/** Letterboxd rates 0.5..5 in half steps; the app stores half-stars 1..10. */
const letterboxdRating = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) && n >= 0.5 && n <= 5 ? Math.round(n * 2) : null;
};

/* ───────────── Letterboxd ───────────── */

export type LetterboxdFiles = { diary?: string; ratings?: string; reviews?: string; watched?: string };

/**
 * Merges the export's files into one row per viewing.
 *  - diary.csv: one row per logged viewing (date, rating, rewatch). The backbone.
 *  - reviews.csv: attaches review text to the matching viewing (or makes one if the diary doesn't have it).
 *  - ratings.csv / watched.csv: films you rated or marked watched without a diary entry become one viewing, dated by when
 *    you rated / marked them (the only date Letterboxd gives for those).
 */
export function letterboxdRows(files: LetterboxdFiles) {
  const rows: ImportRow[] = [];
  const byViewing = new Map<string, ImportRow>();
  const filmsWithViewing = new Set<string>();

  const base = (r: Record<string, string>): Omit<ImportRow, "watchedOn" | "rating" | "rewatch" | "review"> | null => {
    const title = r["Name"];
    const uri = r["Letterboxd URI"];
    if (!title || !uri) return null;
    return { source: "letterboxd", kind: "movie", title, year: toYear(r["Year"]), letterboxdUri: uri };
  };
  const add = (key: string, row: ImportRow) => { byViewing.set(key, row); rows.push(row); filmsWithViewing.add(row.letterboxdUri ?? ""); return row; };

  for (const r of parseCsv(files.diary ?? "")) {
    const b = base(r);
    const date = isoDate(r["Watched Date"]) ?? isoDate(r["Date"]);
    if (!b) continue;
    add(`${b.letterboxdUri}|${date}`, { ...b, watchedOn: date, rating: letterboxdRating(r["Rating"]), rewatch: r["Rewatch"].toLowerCase() === "yes", review: null });
  }

  for (const r of parseCsv(files.reviews ?? "")) {
    const b = base(r);
    const date = isoDate(r["Watched Date"]) ?? isoDate(r["Date"]);
    if (!b) continue;
    const text = r["Review"] || null;
    const existing = byViewing.get(`${b.letterboxdUri}|${date}`);
    if (existing) {
      existing.review ??= text;
      existing.rating ??= letterboxdRating(r["Rating"]);
    } else {
      add(`${b.letterboxdUri}|${date}`, { ...b, watchedOn: date, rating: letterboxdRating(r["Rating"]), rewatch: r["Rewatch"].toLowerCase() === "yes", review: text });
    }
  }

  // A rating given on the film page (not in the diary) fills in diary entries that have none.
  const ratingByFilm = new Map<string, number>();
  const ratingRows = parseCsv(files.ratings ?? "");
  for (const r of ratingRows) {
    const rating = letterboxdRating(r["Rating"]);
    if (rating && r["Letterboxd URI"]) ratingByFilm.set(r["Letterboxd URI"], rating);
  }
  for (const row of rows) if (row.rating === null && row.letterboxdUri) row.rating = ratingByFilm.get(row.letterboxdUri) ?? null;

  for (const r of ratingRows) {
    const b = base(r);
    if (!b || filmsWithViewing.has(b.letterboxdUri ?? "")) continue;
    add(`${b.letterboxdUri}|${isoDate(r["Date"])}`, { ...b, watchedOn: isoDate(r["Date"]), rating: letterboxdRating(r["Rating"]), rewatch: false, review: null });
  }
  for (const r of parseCsv(files.watched ?? "")) {
    const b = base(r);
    if (!b || filmsWithViewing.has(b.letterboxdUri ?? "")) continue;
    add(`${b.letterboxdUri}|${isoDate(r["Date"])}`, { ...b, watchedOn: isoDate(r["Date"]), rating: ratingByFilm.get(b.letterboxdUri ?? "") ?? null, rewatch: false, review: null });
  }

  return {
    rows,
    films: filmsWithViewing.size,
    undated: rows.filter((r) => r.watchedOn === null).length,
  };
}

/* ───────────── MyAnimeList ───────────── */

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#0?39;/g, "'").replace(/&amp;/g, "&");

function xmlField(block: string, tag: string) {
  const m = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`).exec(block);
  if (!m) return "";
  return (m[1] ?? decodeEntities(m[2] ?? "")).trim();
}

export type MalSkipped = { watching: number; planned: number; onHold: number; dropped: number };

/** Completed anime only: they're the ones that are "watched". The rest is counted so the person knows what was left out. */
export function malRows(xml: string) {
  const rows: ImportRow[] = [];
  const skipped: MalSkipped = { watching: 0, planned: 0, onHold: 0, dropped: 0 };

  for (const m of xml.matchAll(/<anime>([\s\S]*?)<\/anime>/g)) {
    const block = m[1];
    const status = xmlField(block, "my_status").toLowerCase();
    if (status === "watching") { skipped.watching++; continue; }
    if (status === "plan to watch") { skipped.planned++; continue; }
    if (status === "on-hold" || status === "on hold") { skipped.onHold++; continue; }
    if (status === "dropped") { skipped.dropped++; continue; }
    if (status !== "completed") continue;

    const id = Number.parseInt(xmlField(block, "series_animedb_id"), 10);
    const title = xmlField(block, "series_title");
    if (!Number.isFinite(id) || !title) continue;
    const score = Number.parseInt(xmlField(block, "my_score"), 10);
    rows.push({
      source: "mal", kind: "anime", title, year: null, malId: id,
      rating: score >= 1 && score <= 10 ? score : null, // MAL scores 1..10 → half-stars 1..10
      watchedOn: isoDate(xmlField(block, "my_finish_date")) ?? isoDate(xmlField(block, "my_start_date")),
      rewatch: false, review: null,
    });
  }
  return { rows, skipped, undated: rows.filter((r) => r.watchedOn === null).length };
}

/* ───────────── AniList ───────────── */

/** Completed anime of a public profile. `score(format: POINT_10)` makes AniList convert whatever scale the user picked to 0..10. */
export const ANILIST_LIST_QUERY = `
query ($userName: String, $chunk: Int) {
  MediaListCollection(userName: $userName, type: ANIME, status: COMPLETED, chunk: $chunk, perChunk: 500, forceSingleCompletedList: true) {
    hasNextChunk
    lists { entries {
      score(format: POINT_10)
      repeat
      completedAt { year month day }
      startedAt { year month day }
      media { id idMal title { romaji english } coverImage { large } seasonYear startDate { year } duration }
    } }
  }
}`;

/** Looks anime up by AniList id. The server uses this so covers and titles never come from the browser. */
export const ANILIST_BY_ID_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) { id idMal title { romaji english } coverImage { large } seasonYear startDate { year } duration }
  }
}`;

/** Looks anime up by MyAnimeList id, to give MAL imports titles, years and covers. */
export const ANILIST_BY_MAL_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: ANIME) { id idMal title { romaji english } coverImage { large } seasonYear startDate { year } duration }
  }
}`;

type AniDate = { year: number | null; month: number | null; day: number | null } | null;
export type AniMedia = {
  id: number; idMal: number | null; title: { romaji: string | null; english: string | null } | null;
  coverImage: { large: string | null } | null; seasonYear: number | null; startDate: { year: number | null } | null; duration: number | null;
};

const aniDate = (d: AniDate | undefined) => (d && d.year && d.month && d.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null);

/** The title fields shared by list entries and by lookups: used for AniList rows and to enrich MAL rows. */
export function aniMediaFields(m: AniMedia): Pick<ImportRow, "anilistId" | "malId" | "year" | "originalTitle" | "posterPath" | "runtimeMin" | "titles"> {
  const romaji = m.title?.romaji ?? m.title?.english ?? "";
  const english = m.title?.english ?? romaji;
  return {
    anilistId: m.id,
    malId: m.idMal ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    originalTitle: romaji,
    posterPath: m.coverImage?.large ?? null,
    runtimeMin: m.duration ?? null,
    titles: { it: english, en: english, es: english },
  };
}

export type AniListResponse = {
  data?: { MediaListCollection?: { hasNextChunk: boolean; lists: { entries: { score: number; completedAt: AniDate; startedAt: AniDate; media: AniMedia }[] }[] } | null };
};

export function anilistRows(responses: AniListResponse[]) {
  const seen = new Set<number>();
  const rows: ImportRow[] = [];
  for (const res of responses) {
    for (const list of res.data?.MediaListCollection?.lists ?? []) {
      for (const e of list.entries) {
        if (!e.media || seen.has(e.media.id)) continue;
        seen.add(e.media.id);
        const f = aniMediaFields(e.media);
        rows.push({
          source: "anilist", kind: "anime", title: f.originalTitle || f.titles?.en || "", ...f,
          rating: e.score >= 1 && e.score <= 10 ? e.score : null,
          watchedOn: aniDate(e.completedAt) ?? aniDate(e.startedAt),
          rewatch: false, review: null,
        });
      }
    }
  }
  const clean = rows.filter((r) => r.title);
  return { rows: clean, undated: clean.filter((r) => r.watchedOn === null).length };
}

/* ───────────── IMDb ───────────── */

export type ImdbSkipped = { episodes: number; other: number };

/**
 * IMDb's ratings export ("Your Ratings" → Export, ratings.csv). Films and TV movies become films, series and miniseries
 * become series; episodes, shorts, games and the rest are counted and left out. IMDb only records when you RATED, not when
 * you watched, so that date is used (the person can also choose to import without dates).
 */
export function imdbRows(csv: string) {
  const rows: ImportRow[] = [];
  const skipped: ImdbSkipped = { episodes: 0, other: 0 };
  const seen = new Set<string>();
  for (const r of parseCsv(csv)) {
    const id = (r["Const"] ?? "").trim();
    const title = (r["Title"] ?? r["Original Title"] ?? "").trim();
    if (!/^tt\d+$/.test(id) || !title || seen.has(id)) continue;
    const type = (r["Title Type"] ?? "").trim().toLowerCase();
    const kind = type === "movie" || type === "tvmovie" || type === "tv movie" ? "movie" : type === "tvseries" || type === "tvminiseries" || type === "tv series" || type === "tv mini series" ? "tv" : null;
    if (!kind) { if (type.includes("episode")) skipped.episodes++; else skipped.other++; continue; }
    seen.add(id);
    const score = Number.parseInt(r["Your Rating"] ?? "", 10);
    const year = Number.parseInt(r["Year"] ?? "", 10);
    rows.push({
      source: "imdb", kind, title, year: Number.isFinite(year) ? year : null, imdbId: id,
      rating: score >= 1 && score <= 10 ? score : null, // IMDb rates 1..10 → half-stars 1..10
      watchedOn: isoDate(r["Date Rated"]), rewatch: false, review: null,
    });
  }
  return { rows, skipped, undated: rows.filter((x) => x.watchedOn === null).length };
}

/* ───────────── Trakt ───────────── */

type TraktIds = { imdb?: string | null; tmdb?: number | null };
type TraktItem = { title?: string; year?: number | null; ids?: TraktIds };
export type TraktFiles = { watchedMovies?: string; watchedShows?: string; ratingsMovies?: string; ratingsShows?: string };

const jsonArray = (s: string | undefined): Record<string, unknown>[] => {
  try { const v = JSON.parse(s ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const dayOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * Trakt's data export (Settings → Data → Export): watched-movies.json, watched-shows.json and the two ratings files.
 * One row per film or show, dated by the last time it was watched; the rating comes from the ratings file when there is one
 * (Trakt rates 1..10). A rated-but-not-watched title is imported too (it is a rating the person gave).
 */
export function traktRows(files: TraktFiles) {
  const rows = new Map<string, ImportRow>();
  const put = (kind: "movie" | "tv", item: TraktItem | undefined, patch: Partial<ImportRow>) => {
    const title = item?.title?.trim();
    if (!title) return;
    const tmdbId = item?.ids?.tmdb ?? null;
    const imdbId = item?.ids?.imdb && /^tt\d+$/.test(item.ids.imdb) ? item.ids.imdb : null;
    const key = kind + ":" + (tmdbId ?? imdbId ?? title.toLowerCase() + "|" + (item?.year ?? ""));
    const row = rows.get(key) ?? { source: "trakt" as const, kind, title, year: item?.year ?? null, rating: null, watchedOn: null, rewatch: false, review: null, tmdbId, imdbId };
    rows.set(key, { ...row, ...patch });
  };
  for (const w of jsonArray(files.watchedMovies)) put("movie", w.movie as TraktItem, { watchedOn: dayOf(w.last_watched_at), rewatch: Number(w.plays) > 1 });
  for (const w of jsonArray(files.watchedShows)) put("tv", w.show as TraktItem, { watchedOn: dayOf(w.last_watched_at) });
  const rate = (kind: "movie" | "tv", list: Record<string, unknown>[], field: "movie" | "show") => {
    for (const r of list) {
      const score = Number(r.rating);
      if (!(score >= 1 && score <= 10)) continue;
      const item = r[field] as TraktItem | undefined;
      const existing = [...rows.entries()].find(([k, v]) => k.startsWith(kind + ":") && v.title === item?.title?.trim() && v.year === (item?.year ?? null));
      put(kind, item, { rating: Math.round(score), ...(existing ? {} : { watchedOn: dayOf(r.rated_at) }) });
    }
  };
  rate("movie", jsonArray(files.ratingsMovies), "movie");
  rate("tv", jsonArray(files.ratingsShows), "show");
  const out = [...rows.values()];
  return { rows: out, undated: out.filter((r) => r.watchedOn === null).length };
}

/* ───────────── MyAnimeList through Jikan (its public API) ───────────── */

export type JikanPage = { data?: { score?: number; finish_date?: string | null; start_date?: string | null; watching_status?: number | string; anime?: { mal_id?: number; title?: string; year?: number | null } }[]; pagination?: { has_next_page?: boolean } };

/**
 * A MAL user's completed list as Jikan (api.jikan.moe, the community API over MAL's public data) returns it, page by page.
 * The shape follows Jikan's v4 documentation: if a field is missing the row is simply left out or undated, never invented.
 */
export function jikanRows(pages: JikanPage[]) {
  const rows: ImportRow[] = [];
  const seen = new Set<number>();
  for (const page of pages) {
    for (const e of page.data ?? []) {
      const id = e.anime?.mal_id;
      const title = e.anime?.title?.trim();
      if (!id || !title || seen.has(id)) continue;
      const status = String(e.watching_status ?? "completed").toLowerCase();
      if (!(status === "2" || status.includes("complet"))) continue;
      seen.add(id);
      const score = Number(e.score ?? 0);
      rows.push({
        source: "mal", kind: "anime", title, year: e.anime?.year ?? null, malId: id,
        rating: score >= 1 && score <= 10 ? Math.round(score) : null,
        watchedOn: dayOf(e.finish_date) ?? dayOf(e.start_date), rewatch: false, review: null,
      });
    }
  }
  return { rows, undated: rows.filter((r) => r.watchedOn === null).length };
}
