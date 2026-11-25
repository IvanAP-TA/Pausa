// Turns the files a person picked into what the parsers take. Platform-free: a picked file is `{ name, bytes }`, however it was read
// (a browser File, or a file on the phone), so this is tested without either. ZIP and gzip are opened with fflate (V1 did the same).
import { gunzipSync, unzipSync } from "fflate";
import {
  ANILIST_LIST_QUERY, anilistRows, cinemaniacBackup, imdbRows, jikanRows, letterboxdList, letterboxdRows, letterboxdWatchlist, malRows, traktJsonRows,
  type AniListResponse, type ImdbSkipped, type ImportList, type ImportRow, type JikanPage, type LetterboxdFiles, type MalSkipped,
} from "./index";

export type Picked = { name: string; bytes: Uint8Array };
export type Parsed = { rows: ImportRow[]; lists?: ImportList[]; undated: number; films?: number; skipped?: MalSkipped; imdbSkipped?: ImdbSkipped; titles?: boolean };

/** Problems the screen can name: each one is a key of `import.errors.*`. Anything else becomes "read". */
export type ReadProblem = "read" | "empty" | "imdbFormat" | "imdbZip" | "traktFormat" | "traktJson" | "letterboxdFormat" | "cinemaniacFormat" | "anilistNotFound" | "anilistDown" | "malNotFound" | "malDown";
export class ImportReadError extends Error {
  constructor(readonly problem: ReadProblem) {
    super(problem);
    this.name = "ImportReadError";
  }
}

const decoder = new TextDecoder("utf-8");
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b; // "PK"
const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;
const baseName = (path: string) => path.toLowerCase().split(/[\\/]/).pop() ?? "";

/** Which Letterboxd export file is this? By name, or by its header line if the file was renamed. */
export function classifyLetterboxd(name: string, text: string): keyof LetterboxdFiles | null {
  const base = baseName(name);
  if (base === "diary.csv") return "diary";
  if (base === "ratings.csv") return "ratings";
  if (base === "reviews.csv") return "reviews";
  if (base === "watched.csv") return "watched";
  const head = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (!head.includes("Letterboxd URI")) return null;
  if (head.includes("Review")) return "reviews";
  if (head.includes("Watched Date")) return "diary";
  if (head.includes("Rating")) return "ratings";
  return "watched";
}

/** The export's files plus its lists: watchlist.csv and lists/*.csv (or a list CSV picked on its own). */
export function readLetterboxd(files: Picked[]): { files: LetterboxdFiles; lists: ImportList[] } {
  const out: LetterboxdFiles = {};
  const lists: ImportList[] = [];
  const takeList = (name: string, text: string) => {
    const l = baseName(name) === "watchlist.csv" ? letterboxdWatchlist(text) : letterboxdList(text);
    if (l) lists.push(l);
    return l !== null;
  };
  for (const f of files) {
    if (isZip(f.bytes)) {
      for (const [path, data] of Object.entries(unzipSync(f.bytes))) {
        if (!path.toLowerCase().endsWith(".csv")) continue;
        if (path.toLowerCase().startsWith("lists/")) {
          takeList(path, decoder.decode(data));
          continue;
        }
        if (path.includes("/")) continue; // deleted/, likes/, orphaned/
        const text = decoder.decode(data);
        if (path.toLowerCase() === "watchlist.csv") {
          takeList(path, text);
          continue;
        }
        const kind = classifyLetterboxd(path, text);
        if (kind) out[kind] = text;
      }
    } else {
      const text = decoder.decode(f.bytes);
      if (takeList(f.name, text)) continue;
      const kind = classifyLetterboxd(f.name, text);
      if (kind) out[kind] = text;
    }
  }
  return { files: out, lists };
}

/** MAL's export is a `.xml.gz`; an already unpacked `.xml` is fine too. */
export function readMal(file: Picked): string {
  return decoder.decode(isGzip(file.bytes) ? gunzipSync(file.bytes) : file.bytes);
}

/**
 * Trakt's export: a ZIP whose JSON files sit in folders, or those files picked loose. Every .json is handed over, wherever it is and
 * whatever it is called: the parser tells viewings and ratings from the rest by what the entries contain.
 */
export function readTrakt(files: Picked[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (isZip(f.bytes)) {
      for (const [path, data] of Object.entries(unzipSync(f.bytes, { filter: (file) => file.name.toLowerCase().endsWith(".json") }))) {
        if (!path.split("/").pop()?.startsWith(".")) out.push(decoder.decode(data)); // not macOS "._file" leftovers
      }
    } else out.push(decoder.decode(f.bytes));
  }
  return out;
}

export type FileSource = "letterboxd" | "imdb" | "trakt" | "cinemaniac" | "mal";

/** One picked set of files of one source, parsed. Throws `ImportReadError` with the problem to show. */
export function parseFiles(source: FileSource, files: Picked[]): Parsed {
  try {
    switch (source) {
      case "letterboxd": {
        const read = readLetterboxd(files);
        if (Object.keys(read.files).length === 0 && read.lists.length === 0) throw new ImportReadError("letterboxdFormat");
        const { rows, films, undated } = letterboxdRows(read.files);
        return { rows, films, undated, lists: read.lists };
      }
      case "imdb": {
        const f = files[0];
        if (!f) throw new ImportReadError("read");
        if (isZip(f.bytes)) throw new ImportReadError("imdbZip"); // IMDb gives a plain .csv
        const { rows, undated, skipped, recognized } = imdbRows(decoder.decode(f.bytes));
        if (!recognized) throw new ImportReadError("imdbFormat");
        return { rows, undated, imdbSkipped: skipped, titles: true };
      }
      case "trakt": {
        const { rows, undated, recognized, broken } = traktJsonRows(readTrakt(files));
        if (!recognized) throw new ImportReadError(broken > 0 ? "traktJson" : "traktFormat");
        return { rows, undated, titles: true };
      }
      case "cinemaniac": {
        const f = files[0];
        if (!f) throw new ImportReadError("read");
        const { rows, watchlist, undated, recognized } = cinemaniacBackup(decoder.decode(f.bytes));
        if (!recognized) throw new ImportReadError("cinemaniacFormat");
        return { rows, undated, lists: watchlist ? [watchlist] : [], titles: true };
      }
      case "mal": {
        const f = files[0];
        if (!f) throw new ImportReadError("read");
        const { rows, skipped, undated } = malRows(readMal(f));
        return { rows, skipped, undated };
      }
    }
  } catch (e) {
    throw e instanceof ImportReadError ? e : new ImportReadError("read");
  }
}

/** Nothing to import in what was read: the person is told, not shown an empty summary. */
export function assertSomething(p: Parsed): Parsed {
  if (p.rows.length === 0 && !(p.lists && p.lists.length > 0)) throw new ImportReadError("empty");
  return p;
}

// ───────────── from the device: AniList and Jikan (MyAnimeList) ─────────────

export type Fetcher = typeof fetch;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchJikan(userName: string, doFetch: Fetcher = fetch, wait: (ms: number) => Promise<void> = sleep): Promise<JikanPage[]> {
  const pages: JikanPage[] = [];
  for (let page = 1; page <= 40; page++) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await doFetch(`https://api.jikan.moe/v4/users/${encodeURIComponent(userName)}/animelist?status=completed&page=${page}`, { headers: { Accept: "application/json" } });
      if (res.status !== 429) break;
      await wait(1500 * (attempt + 1));
    }
    if (!res || res.status === 404 || res.status === 400) throw new ImportReadError("malNotFound");
    if (!res.ok) throw new ImportReadError("malDown");
    const json = (await res.json()) as JikanPage;
    pages.push(json);
    if (!json.pagination?.has_next_page) break;
    await wait(400);
  }
  return pages;
}

export async function fetchAniList(userName: string, doFetch: Fetcher = fetch): Promise<AniListResponse[]> {
  const pages: AniListResponse[] = [];
  for (let chunk = 1; chunk <= 12; chunk++) {
    const res = await doFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: ANILIST_LIST_QUERY, variables: { userName, chunk } }),
    });
    if (res.status === 404) throw new ImportReadError("anilistNotFound");
    if (!res.ok) throw new ImportReadError("anilistDown");
    const json = (await res.json()) as AniListResponse;
    pages.push(json);
    if (!json.data?.MediaListCollection?.hasNextChunk) break;
  }
  return pages;
}

export { anilistRows, jikanRows };
export type { ImportRow, ImportList };
