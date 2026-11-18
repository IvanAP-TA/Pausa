/* Writes imported viewings (see import-parsers.ts) into the database.
 *
 * - Idempotent: a viewing already logged (same person, title and date) is skipped, so running an import twice,
 *   or two overlapping exports, adds nothing the second time.
 * - Titles are matched to what the app already knows by source id (Letterboxd URI, AniList, MAL, TMDB) and, failing
 *   that, by title + kind + year, so an imported film joins the same title other people have logged.
 * - Imported logs are private (scope "private"), dated by when they were watched (not "now") and create no
 *   notifications: importing years of history must not flood anyone's feed.
 * - The person may pick one Cerchia as the destination: the logs are still private, and each is shared with that
 *   Cerchia (log_share), dated like the log, so the group's diary files them where they belong in time.
 * - Every log, share and list an import makes carries its batch id (import_batch), so the whole run can be taken out
 *   of a Cerchia again (see import-batches.ts).
 * - Work happens in small chunks (CHUNK_LIMIT rows): D1 allows ~100 bound variables and a limited number of queries
 *   per request, so the caller sends the file piece by piece.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { list, listItem, log, logShare, mediaEntity, mediaTitle } from "../../db/schema";
import type { AnyDb } from "./db-types";
import type { ImportRow } from "./import-parsers";

export const CHUNK_LIMIT = 30;

type Media = typeof mediaEntity.$inferSelect;
type MediaInsert = typeof mediaEntity.$inferInsert;

export type ImportOptions = {
  includeReviews: boolean;
  /** Rows the source has no date for: import them dated `today`, or skip them. */
  includeUndated: boolean;
  today: string; // YYYY-MM-DD
  /** Looks up the rows whose title the app doesn't know yet (TMDB for films, AniList for MAL anime). Same order, same length. */
  enrich?: (rows: ImportRow[]) => Promise<ImportRow[]>;
  /** The run this chunk belongs to (import_batch); null/absent = untracked. */
  batchId?: string | null;
  /** Destination: null/absent = the personal space only; a Cerchia id = also shown there (the caller checked membership). */
  circleId?: string | null;
};

export type ImportResult = {
  imported: number; // viewings added
  alreadyHad: number; // viewings that were already there
  addedToCircle: number; // viewings this chunk put in the destination Cerchia (new ones, and private ones already there)
  newTitles: number; // titles the app didn't know before
  undatedSkipped: number;
  invalid: number;
};

/** SQLite's lower() only folds ASCII; do the same here so what we send matches what the database compares. */
const sqlLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
/** Every name a row is known by: the source title, the original one, and the localized ones enrichment found. */
const namesOf = (r: ImportRow) => nonNull([r.title, r.originalTitle, ...Object.values(r.titles ?? {})]);
const normTitle = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sqlLowerCol = (col: SQLiteColumn) => sql<string>`lower(${col})`;
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const nonNull = <T>(xs: (T | null | undefined)[]) => xs.filter((x): x is T => x !== null && x !== undefined);

const identity = (r: ImportRow) =>
  r.letterboxdUri ? `lb:${r.letterboxdUri}` : r.anilistId ? `al:${r.anilistId}` : r.malId ? `mal:${r.malId}` : r.tmdbId ? `tmdb:${r.kind}:${r.tmdbId}` : r.imdbId ? `imdb:${r.imdbId}` : `t:${r.kind}|${normTitle(r.title)}|${r.year ?? ""}`;

async function inChunks<T>(items: T[], size: number, run: (part: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await run(items.slice(i, i + size));
}

/** What the database already has for each row (by id first, then by title). */
async function findExisting(db: AnyDb, rows: ImportRow[]) {
  const found = new Map<ImportRow, Media>();
  if (rows.length === 0) return found;

  const byUri = new Map<string, Media>();
  const byAnilist = new Map<number, Media>();
  const byMal = new Map<number, Media>();
  const byTmdb = new Map<string, Media>(); // "movie:123" / "tv:123": the same number can be a film and a series
  const byImdb = new Map<string, Media>();
  const byTitle = new Map<string, Media[]>();

  const uris = uniq(nonNull(rows.map((r) => r.letterboxdUri)));
  if (uris.length) for (const m of await db.select().from(mediaEntity).where(inArray(mediaEntity.letterboxdUri, uris))) byUri.set(m.letterboxdUri!, m);
  const aids = uniq(nonNull(rows.map((r) => r.anilistId)));
  if (aids.length) for (const m of await db.select().from(mediaEntity).where(inArray(mediaEntity.anilistId, aids))) byAnilist.set(m.anilistId!, m);
  const mids = uniq(nonNull(rows.map((r) => r.malId)));
  if (mids.length) for (const m of await db.select().from(mediaEntity).where(inArray(mediaEntity.malId, mids))) byMal.set(m.malId!, m);
  for (const kind of ["movie", "tv"] as const) {
    const tids = uniq(nonNull(rows.filter((r) => r.kind === kind).map((r) => r.tmdbId)));
    if (tids.length) for (const m of await db.select().from(mediaEntity).where(and(eq(mediaEntity.kind, kind), inArray(mediaEntity.tmdbId, tids)))) byTmdb.set(kind + ":" + m.tmdbId, m);
  }
  const imdbs = uniq(nonNull(rows.map((r) => r.imdbId)));
  if (imdbs.length) for (const m of await db.select().from(mediaEntity).where(inArray(mediaEntity.imdbId, imdbs))) byImdb.set(m.imdbId!, m);

  // By title: the original title or any localized one ("Spirited Away" finds the film stored as 千と千尋の神隠し).
  // The list is used twice in the query, so 40 titles keep it under D1's 100 bound variables.
  const addTitle = (key: string, m: Media) => {
    const list = byTitle.get(key) ?? [];
    if (!list.some((x) => x.id === m.id)) list.push(m);
    byTitle.set(key, list);
  };
  await inChunks(uniq(rows.flatMap((r) => namesOf(r).map(sqlLower))), 40, async (titles) => {
    const hits = await db.select({ m: mediaEntity, t: mediaTitle.title }).from(mediaEntity)
      .leftJoin(mediaTitle, eq(mediaTitle.mediaId, mediaEntity.id))
      .where(or(inArray(sqlLowerCol(mediaEntity.originalTitle), titles), inArray(sqlLowerCol(mediaTitle.title), titles)));
    for (const h of hits) {
      addTitle(normTitle(h.m.originalTitle), h.m);
      if (h.t) addTitle(normTitle(h.t), h.m);
    }
  });

  for (const r of rows) {
    const direct =
      (r.letterboxdUri && byUri.get(r.letterboxdUri)) || (r.anilistId && byAnilist.get(r.anilistId)) ||
      (r.malId && byMal.get(r.malId)) || (r.tmdbId && byTmdb.get(r.kind + ":" + r.tmdbId)) || (r.imdbId && byImdb.get(r.imdbId)) || null;
    if (direct) { found.set(r, direct); continue; }
    const candidates = namesOf(r).flatMap((t) => byTitle.get(normTitle(t)) ?? []);
    const match = candidates.find((m) => m.kind === r.kind && (r.year === null || m.year === null || Math.abs(m.year - r.year) <= 1));
    if (match) found.set(r, match);
  }
  return found;
}

/** Finds or creates the title of every row (looking new ones up through `enrich`). Returns the rows as enriched and each row's media id. */
export async function resolveMedia(db: AnyDb, input: ImportRow[], enrich?: ImportOptions["enrich"]) {
  let rows = input;
  // 2. Which titles does the app already have? Look the rest up (TMDB / AniList) only if there's something new.
  let existing = await findExisting(db, rows);
  const unknown = rows.filter((r) => !existing.has(r));
  if (unknown.length && enrich) {
    const enriched = await enrich(unknown);
    const swap = new Map(unknown.map((r, i) => [r, enriched[i] ?? r]));
    rows = rows.map((r) => swap.get(r) ?? r);
    existing = await findExisting(db, rows); // enrichment may have revealed ids the app already knows
  }

  // 3. Create the titles that are genuinely new (one per identity), and fill gaps in the ones we already had.
  const created = new Map<string, MediaInsert>();
  for (const r of rows) {
    if (existing.has(r)) continue;
    const key = identity(r);
    if (created.has(key)) continue;
    created.set(key, {
      id: crypto.randomUUID(), kind: r.kind, tmdbId: r.kind === "anime" ? null : r.tmdbId ?? null, imdbId: r.imdbId ?? null,
      anilistId: r.anilistId ?? null, malId: r.malId ?? null, letterboxdUri: r.letterboxdUri ?? null,
      originalTitle: (r.originalTitle || r.title).slice(0, 300), year: r.year, runtimeMin: r.runtimeMin ?? null, posterPath: r.posterPath ?? null,
    });
  }
  const newMedia = [...created.values()];
  await inChunks(newMedia, 7, async (part) => { await db.insert(mediaEntity).values(part).onConflictDoNothing(); });
  

  const mediaIdOf = new Map<ImportRow, string>();
  for (const [r, m] of existing) mediaIdOf.set(r, m.id);
  for (const r of rows) if (!mediaIdOf.has(r)) mediaIdOf.set(r, created.get(identity(r))!.id as string);

  // A conflict (someone created the same title a moment ago) leaves our id unused: re-resolve those rows.
  const ids = [...mediaIdOf.values()];
  const present = new Set<string>();
  await inChunks(uniq(ids), 90, async (part) => { for (const m of await db.select({ id: mediaEntity.id }).from(mediaEntity).where(inArray(mediaEntity.id, part))) present.add(m.id); });
  const lost = rows.filter((r) => !present.has(mediaIdOf.get(r)!));
  if (lost.length) {
    const again = await findExisting(db, lost);
    for (const r of lost) {
      const m = again.get(r);
      if (m) mediaIdOf.set(r, m.id);
      else mediaIdOf.delete(r);
    }
  }

  // Fill gaps on titles we already had (a cover, a year, a new source id), never overwriting anything.
  const patches = new Map<string, Partial<MediaInsert>>();
  for (const [r, m] of existing) {
    const p = patches.get(m.id) ?? {};
    if (m.letterboxdUri === null && r.letterboxdUri) p.letterboxdUri = r.letterboxdUri;
    if (m.anilistId === null && r.anilistId) p.anilistId = r.anilistId;
    if (m.malId === null && r.malId) p.malId = r.malId;
    if (m.tmdbId === null && r.tmdbId && m.kind !== "anime") p.tmdbId = r.tmdbId;
    if (m.imdbId === null && r.imdbId) p.imdbId = r.imdbId;
    if (m.posterPath === null && r.posterPath) p.posterPath = r.posterPath;
    if (m.year === null && r.year) p.year = r.year;
    if (m.runtimeMin === null && r.runtimeMin) p.runtimeMin = r.runtimeMin;
    if (Object.keys(p).length) patches.set(m.id, p);
  }
  for (const [id, p] of patches) {
    try { await db.update(mediaEntity).set(p).where(eq(mediaEntity.id, id)); } catch { /* an id already used by another title: keep going */ }
  }

  // Localized titles, when the source knows them.
  const titleRows = new Map<string, typeof mediaTitle.$inferInsert>();
  for (const r of rows) {
    const mediaId = mediaIdOf.get(r);
    if (!mediaId) continue;
    for (const [locale, title] of Object.entries(r.titles ?? {})) if (title) titleRows.set(`${mediaId}|${locale}`, { mediaId, locale, title: title.slice(0, 300) });
  }
  await inChunks([...titleRows.values()], 30, async (part) => { await db.insert(mediaTitle).values(part).onConflictDoNothing(); });


  return { rows, mediaIdOf, newTitles: newMedia.length };
}

export async function importRows(db: AnyDb, userId: string, input: ImportRow[], opts: ImportOptions): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, alreadyHad: 0, addedToCircle: 0, newTitles: 0, undatedSkipped: 0, invalid: 0 };

  // 1. Validate and settle dates.
  let rows: ImportRow[] = [];
  for (const r of input) {
    if (!r.title.trim()) { result.invalid++; continue; }
    if (r.watchedOn === null) {
      if (!opts.includeUndated) { result.undatedSkipped++; continue; }
      rows.push({ ...r, watchedOn: opts.today });
    } else rows.push(r);
  }
  if (rows.length === 0) return result;

  const resolved = await resolveMedia(db, rows, opts.enrich);
  rows = resolved.rows;
  const mediaIdOf = resolved.mediaIdOf;
  result.newTitles = resolved.newTitles;

  // 4. The viewings themselves.
  const targets = uniq([...mediaIdOf.values()]);
  const batchId = opts.batchId ?? null;
  const circleId = opts.circleId ?? null;
  const have = new Map<string, { id: string; scope: "circles" | "private"; createdAt: Date } | null>();
  await inChunks(targets, 90, async (part) => {
    for (const l of await db.select({ id: log.id, mediaId: log.mediaId, watchedOn: log.watchedOn, scope: log.scope, createdAt: log.createdAt }).from(log).where(and(eq(log.userId, userId), inArray(log.mediaId, part)))) {
      have.set(`${l.mediaId}|${l.watchedOn}`, { id: l.id, scope: l.scope, createdAt: l.createdAt });
    }
  });

  const toInsert: (typeof log.$inferInsert)[] = [];
  const toShare: (typeof logShare.$inferInsert)[] = [];
  const alreadyPrivate: { id: string; createdAt: Date }[] = []; // viewings that were there, private: the Cerchia may not have them yet
  for (const r of rows) {
    const mediaId = mediaIdOf.get(r);
    if (!mediaId) { result.invalid++; continue; }
    const key = `${mediaId}|${r.watchedOn}`;
    if (have.has(key)) {
      result.alreadyHad++;
      const old = have.get(key);
      if (circleId && old && old.scope === "private") alreadyPrivate.push(old);
      have.set(key, null); // a second row for the same viewing in this chunk adds nothing more
      continue;
    }
    have.set(key, null);
    const id = crypto.randomUUID();
    const createdAt = new Date(`${r.watchedOn}T12:00:00Z`);
    toInsert.push({
      id, userId, mediaId, watchedOn: r.watchedOn!, rating: r.rating,
      review: opts.includeReviews ? (r.review ?? null)?.slice(0, 4000) ?? null : null,
      // Imported history stays private: it shows in a Cerchia only through a share (the destination, or one by one later).
      isRewatch: r.rewatch, scope: "private", importBatchId: batchId, createdAt,
    });
    if (circleId) toShare.push({ logId: id, circleId, importBatchId: batchId, createdAt });
  }
  await inChunks(toInsert, 8, async (part) => { await db.insert(log).values(part); });
  result.imported = toInsert.length;

  if (circleId) {
    // Private viewings that were already here join the Cerchia too, unless a share is already there (it keeps its origin).
    const shared = new Set<string>();
    await inChunks(alreadyPrivate.map((l) => l.id), 90, async (part) => {
      for (const x of await db.select({ logId: logShare.logId }).from(logShare).where(and(eq(logShare.circleId, circleId), inArray(logShare.logId, part)))) shared.add(x.logId);
    });
    for (const l of alreadyPrivate) if (!shared.has(l.id)) toShare.push({ logId: l.id, circleId, importBatchId: batchId, createdAt: l.createdAt });
    await inChunks(toShare, 20, async (part) => { await db.insert(logShare).values(part).onConflictDoNothing(); });
    result.addedToCircle = toShare.length;
  }
  return result;
}

/* ───────────── Lists ───────────── */

export type ListImportInput = {
  name: string;
  description: string | null;
  kind: "watchlist" | "list";
  /** null: a personal list; a Cerchia id: a group list (the caller has checked the person belongs to it). */
  circleId: string | null;
  rows: ImportRow[];
  /** Position of the first row in the whole list: a long list arrives in several chunks. */
  offset: number;
  /** The run this list belongs to (import_batch): kept on the list when this import creates it. */
  batchId?: string | null;
};

export type ListImportResult = { added: number; alreadyHad: number; newTitles: number; invalid: number; listId: string };

/**
 * Adds one chunk of a list. The list is found by owner + Cerchia + name (or created), so running the import again,
 * or sending the next chunk, fills the same list and adds only what is missing.
 */
export async function importList(db: AnyDb, userId: string, input: ListImportInput, opts: { enrich?: ImportOptions["enrich"] } = {}): Promise<ListImportResult> {
  const name = input.name.trim().slice(0, 80);
  const where = and(eq(list.ownerId, userId), eq(list.name, name), eq(list.kind, input.kind), input.circleId ? eq(list.circleId, input.circleId) : isNull(list.circleId));
  let [found] = await db.select({ id: list.id }).from(list).where(where);
  if (!found) {
    const id = crypto.randomUUID();
    await db.insert(list).values({ id, circleId: input.circleId, ownerId: userId, kind: input.kind, name, description: input.description?.slice(0, 500) ?? null, importBatchId: input.batchId ?? null });
    found = { id };
  }
  const result: ListImportResult = { added: 0, alreadyHad: 0, newTitles: 0, invalid: 0, listId: found.id };
  const rows = input.rows.filter((r) => r.title.trim());
  result.invalid = input.rows.length - rows.length;
  if (rows.length === 0) return result;

  const resolved = await resolveMedia(db, rows, opts.enrich);
  result.newTitles = resolved.newTitles;

  const have = new Set<string>();
  const ids = uniq([...resolved.mediaIdOf.values()]);
  await inChunks(ids, 90, async (part) => {
    for (const i of await db.select({ mediaId: listItem.mediaId }).from(listItem).where(and(eq(listItem.listId, found.id), inArray(listItem.mediaId, part)))) have.add(i.mediaId);
  });
  const toInsert: (typeof listItem.$inferInsert)[] = [];
  resolved.rows.forEach((r, i) => {
    const mediaId = resolved.mediaIdOf.get(r);
    if (!mediaId) { result.invalid++; return; }
    if (have.has(mediaId)) { result.alreadyHad++; return; }
    have.add(mediaId);
    toInsert.push({ listId: found.id, mediaId, position: input.offset + i, addedBy: userId });
  });
  await inChunks(toInsert, 15, async (part) => { await db.insert(listItem).values(part).onConflictDoNothing(); });
  result.added = toInsert.length;
  return result;
}
