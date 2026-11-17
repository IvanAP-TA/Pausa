"use server";

import { z } from "zod";
import { hasLocale } from "next-intl";
import { getDb } from "@/db";
import { routing } from "@/i18n/routing";
import { CHUNK_LIMIT, importRows, type ImportResult } from "@/lib/core/import";
import type { ImportRow } from "@/lib/core/import-parsers";
import { requireUser } from "@/lib/session";
import { enrichAnime, enrichMovies } from "./enrich";
import { allow } from "../limit-guard";

/**
 * What the browser may send for each row: the person's own data and the source's id. Anything else (cover, TMDB id,
 * localized titles) is dropped here and looked up by the server, so a member can't make others' browsers load a URL
 * of their choosing or attach a title to the wrong database entry.
 */
const row = z.object({
  source: z.enum(["letterboxd", "anilist", "mal", "imdb", "trakt"]),
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
  // A Trakt id is only ever used to look the title up on TMDB, which then supplies everything shown.
  tmdbId: z.number().int().positive().nullish(),
});

const payload = z.object({
  rows: z.array(row).min(1).max(CHUNK_LIMIT),
  includeReviews: z.boolean(),
  includeUndated: z.boolean(),
  locale: z.string(),
});

export type ImportChunkResult = ({ ok: true } & ImportResult) | { ok: false; error: "invalid" | "failed" };

/** Imports one chunk (≤ CHUNK_LIMIT rows) of the signed-in person's history. The browser calls this repeatedly. */
export async function importChunk(input: unknown): Promise<ImportChunkResult> {
  const user = await requireUser();
  if (!(await allow("importRows", user.id))) return { ok: false, error: "invalid" };
  const parsed = payload.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { rows, includeReviews, includeUndated, locale: rawLocale } = parsed.data;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;

  const clean: ImportRow[] = rows.map((r) => ({ ...r, letterboxdUri: r.letterboxdUri ?? null, anilistId: r.anilistId ?? null, malId: r.malId ?? null, imdbId: r.imdbId ?? null, tmdbId: r.tmdbId ?? null }));
  try {
    const result = await importRows(await getDb(), user.id, clean, {
      includeReviews, includeUndated, today: new Date().toISOString().slice(0, 10),
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
