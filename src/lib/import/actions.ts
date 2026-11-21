"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale } from "next-intl";
import { getDb } from "@/db";
import { routing } from "@/i18n/routing";
import { CHUNK_LIMIT, importList, importRows, type ImportResult, type ListImportResult } from "@/lib/core/import";
import {
  createImportBatch, deleteBulkDay, deleteImportLogs, getImportBatch, hideBulkDay, removeImportFromCircle,
} from "@/lib/core/import-batches";
import type { ImportRow } from "@/lib/core/import-parsers";
import { requireUser } from "@/lib/session";
import { enrichAnime, enrichMovies } from "./enrich";
import { allow, enforce } from "../limit-guard";

/**
 * What the browser may send for each row: the person's own data and the source's id. Anything else (cover, TMDB id,
 * localized titles) is dropped here and looked up by the server, so a member can't make others' browsers load a URL
 * of their choosing or attach a title to the wrong database entry.
 */
const row = z.object({
  source: z.enum(["letterboxd", "anilist", "mal", "imdb", "trakt", "cinemaniac"]),
  kind: z.enum(["movie", "tv", "anime"]),
  title: z.string().trim().min(1).max(300),
  year: z.number().int().min(1870).max(2200).nullable(),
  rating: z.number().int().min(1).max(10).nullable(),
  watchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  rewatch: z.boolean(),
  review: z.string().max(20000).nullable(),
  letterboxdUri: z.string().regex(/^https:\/\/boxd\.it\/[A-Za-z0-9]+$/).max(60).nullish(),
  anilistId: z.number().int().positive().nullish(),
  malId: z.number().int().positive().nullish(),
  imdbId: z.string().regex(/^tt\d{1,10}$/).nullish(),
  // A Trakt or Cinemaniac TMDB id is only ever used to look the title up on TMDB, which then supplies everything shown.
  tmdbId: z.number().int().positive().nullish(),
});

const source = z.enum(["letterboxd", "anilist", "mal", "imdb", "trakt", "cinemaniac"]);
const batchId = z.string().min(1).max(64);

const payload = z.object({
  batchId,
  rows: z.array(row).min(1).max(CHUNK_LIMIT),
  includeReviews: z.boolean(),
  includeUndated: z.boolean(),
  locale: z.string(),
});

const listPayload = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).nullable(),
  kind: z.enum(["watchlist", "list"]),
  batchId,
  offset: z.number().int().min(0).max(5000),
  rows: z.array(row).min(1).max(CHUNK_LIMIT),
  locale: z.string(),
});

/** "limit": too many chunks in an hour, try later. "invalid": the browser sent something this code does not accept. */
type ChunkError = "invalid" | "failed" | "limit";

export type StartImportResult = { ok: true; batchId: string } | { ok: false; error: ChunkError };

/**
 * Opens one run of the import: where it goes (null = the personal space, or a Cerchia the person belongs to) is fixed
 * here, once, and every chunk that follows names the run instead of a destination.
 */
export async function startImport(input: unknown): Promise<StartImportResult> {
  const user = await requireUser();
  const parsed = z.object({ source, circleId: z.string().min(1).max(64).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await allow("importRows", user.id))) return { ok: false, error: "limit" };
  try {
    const batch = await createImportBatch(await getDb(), { userId: user.id, source: parsed.data.source, circleId: parsed.data.circleId });
    return "error" in batch ? { ok: false, error: "invalid" } : { ok: true, batchId: batch.id };
  } catch (e) {
    console.error("[import] start failed", e);
    return { ok: false, error: "failed" };
  }
}

export type ImportChunkResult = ({ ok: true } & ImportResult) | { ok: false; error: ChunkError };

/** Imports one chunk (≤ CHUNK_LIMIT rows) of the signed-in person's history. The browser calls this repeatedly. */
export async function importChunk(input: unknown): Promise<ImportChunkResult> {
  const user = await requireUser();
  const parsed = payload.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await allow("importRows", user.id))) return { ok: false, error: "limit" };
  const { rows, includeReviews, includeUndated, locale: rawLocale } = parsed.data;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const batch = await getImportBatch(await getDb(), user.id, parsed.data.batchId);
  if (!batch || batch.left) return { ok: false, error: "invalid" };

  const clean: ImportRow[] = rows.map((r) => ({ ...r, letterboxdUri: r.letterboxdUri ?? null, anilistId: r.anilistId ?? null, malId: r.malId ?? null, imdbId: r.imdbId ?? null, tmdbId: r.tmdbId ?? null }));
  try {
    const result = await importRows(await getDb(), user.id, clean, {
      includeReviews, includeUndated, today: new Date().toISOString().slice(0, 10), batchId: batch.id, circleId: batch.circleId,
      enrich: async (unknown) => {
        const movies = unknown.filter((r) => r.kind === "movie" || r.kind === "tv");
        const anime = unknown.filter((r) => r.kind === "anime");
        const [m, a] = await Promise.all([movies.length ? enrichMovies(movies, locale) : [], anime.length ? enrichAnime(anime) : []]);
        const done = new Map<ImportRow, ImportRow>([...movies.map((r, i) => [r, m[i]] as const), ...anime.map((r, i) => [r, a[i]] as const)]);
        return unknown.map((r) => done.get(r) ?? r);
      },
    });
    return { ok: true, ...result };
  } catch (e) {
    console.error("[import] chunk failed", e);
    return { ok: false, error: "failed" };
  }
}

export type ListChunkResult = ({ ok: true } & ListImportResult) | { ok: false; error: ChunkError };

/** Adds one chunk of one list where the run goes: the person's own lists, or the group lists of its Cerchia. */
export async function importListChunk(input: unknown): Promise<ListChunkResult> {
  const user = await requireUser();
  const parsed = listPayload.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await allow("importRows", user.id))) return { ok: false, error: "limit" };
  const { rows, name, description, kind, offset, locale: rawLocale } = parsed.data;
  const batch = await getImportBatch(await getDb(), user.id, parsed.data.batchId);
  if (!batch || batch.left) return { ok: false, error: "invalid" };
  const circleId = batch.circleId;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const clean: ImportRow[] = rows.map((r) => ({ ...r, letterboxdUri: r.letterboxdUri ?? null, anilistId: null, malId: null, imdbId: r.imdbId ?? null, tmdbId: r.tmdbId ?? null }));
  try {
    const result = await importList(await getDb(), user.id, { name, description, kind, circleId, rows: clean, offset, batchId: batch.id }, {
      enrich: async (unknown) => (unknown.length ? enrichMovies(unknown, locale) : []),
    });
    return { ok: true, ...result };
  } catch (e) {
    console.error("[import] list chunk failed", e);
    return { ok: false, error: "failed" };
  }
}

/* ───────────── Manage imports ───────────── */

/** Every action of the page answers the same way: back to the list, with what was done (?removed= or ?deleted=). */
function backToImports(formData: FormData, query: string): never {
  const rawLocale = formData.get("locale");
  const locale = typeof rawLocale === "string" && hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  revalidatePath("/[locale]/me", "layout");
  revalidatePath("/[locale]/c/[circleId]", "layout");
  redirect(`/${locale}/me/imports?${query}`);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Takes one run out of the Cerchia it went to. The viewings stay in the person's own space. */
export async function removeImportFromCircleAction(formData: FormData) {
  const user = await requireUser();
  await enforce("shareLog", user.id);
  const res = await removeImportFromCircle(await getDb(), { userId: user.id, batchId: batchId.parse(formData.get("batchId")) });
  if ("error" in res) throw new Error(res.error);
  backToImports(formData, `removed=${res.removed}&lists=${res.lists}`);
}

/** Deletes the viewings one run added, for good. */
export async function deleteImportAction(formData: FormData) {
  const user = await requireUser();
  await enforce("shareLog", user.id);
  const res = await deleteImportLogs(await getDb(), { userId: user.id, batchId: batchId.parse(formData.get("batchId")) });
  if ("error" in res) throw new Error(res.error);
  backToImports(formData, `deleted=${res.deleted}`);
}

/** An import from before runs were tracked (a day of bulk additions): out of every Cerchia, kept in the personal space. */
export async function hideBulkDayAction(formData: FormData) {
  const user = await requireUser();
  await enforce("shareLog", user.id);
  const res = await hideBulkDay(await getDb(), { userId: user.id, day: day.parse(formData.get("day")) });
  if ("error" in res) throw new Error(res.error);
  backToImports(formData, `removed=${res.removed}&lists=0`);
}

/** The same day of bulk additions, deleted for good. */
export async function deleteBulkDayAction(formData: FormData) {
  const user = await requireUser();
  await enforce("shareLog", user.id);
  const res = await deleteBulkDay(await getDb(), { userId: user.id, day: day.parse(formData.get("day")) });
  if ("error" in res) throw new Error(res.error);
  backToImports(formData, `deleted=${res.deleted}`);
}
