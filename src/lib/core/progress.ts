import { eq } from "drizzle-orm";
import { nowWatching } from "../../db/schema";
import { MAX_EPISODE, MAX_SEASON, advance, getEpisodeInfo, type Position } from "./episodes";
import type { AnyDb } from "./db-types";

/* "Sto guardando…" with a real position: season and episode, so "+1 episode" is one tap. */

export { MAX_EPISODE, MAX_SEASON, type Position };

/** Reads an old free-text label such as "S3·E4", "s3e4" or "E12" into numbers; null when it holds none. */
export function parseLegacy(label: string | null | undefined): Position | null {
  const m = label?.match(/(?:s(?:eason)?\s*(\d{1,2}))?\D*?e(?:p(?:isode)?)?\s*(\d{1,4})/i);
  if (!m) return null;
  return { season: m[1] ? Number(m[1]) : null, episode: Number(m[2]) };
}

/** Parses a form field into a whole number in 1..max, or null when empty/invalid. */
export function toPosition(value: unknown, max: number): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

/** "S3·E4", "E12" (anime without seasons), "S2", or the old free-text label for rows saved before this existed. */
export function formatProgress(p: Position & { progress?: string | null }): string | null {
  if (p.season && p.episode) return `S${p.season}·E${p.episode}`;
  if (p.episode) return `E${p.episode}`;
  if (p.season) return `S${p.season}`;
  return p.progress?.trim() || null;
}

/** Starts or updates what a person is watching. `titleChanged` tells the caller whether to notify the Cerchia. */
export async function setWatching(db: AnyDb, input: { userId: string; mediaId: string } & Position) {
  const [current] = await db.select({ mediaId: nowWatching.mediaId }).from(nowWatching).where(eq(nowWatching.userId, input.userId));
  const values = { mediaId: input.mediaId, season: input.season, episode: input.episode, progress: null, updatedAt: new Date() };
  await db.insert(nowWatching).values({ userId: input.userId, ...values }).onConflictDoUpdate({ target: nowWatching.userId, set: values });
  return { titleChanged: current?.mediaId !== input.mediaId };
}

/** One tap forward. At the end of a season it moves to the next when the counts are known. A legacy label such as "S1·E2" is read first; with no numbers at all it starts at episode 1. Returns the new position, or null if nothing is being watched. */
export async function nextEpisode(db: AnyDb, userId: string): Promise<Position | null> {
  const [row] = await db.select({ mediaId: nowWatching.mediaId, season: nowWatching.season, episode: nowWatching.episode, progress: nowWatching.progress }).from(nowWatching).where(eq(nowWatching.userId, userId));
  if (!row) return null;
  const from = row.season || row.episode ? row : (parseLegacy(row.progress) ?? row);
  // With known episode counts, the last episode of a season rolls over to the next season.
  const next = advance(await getEpisodeInfo(db, row.mediaId), { season: from.season, episode: from.episode });
  await db.update(nowWatching).set({ ...next, progress: null, updatedAt: new Date() }).where(eq(nowWatching.userId, userId));
  return next;
}

/** A new season starts at its episode 1. */
export async function nextSeason(db: AnyDb, userId: string): Promise<Position | null> {
  const [row] = await db.select({ season: nowWatching.season }).from(nowWatching).where(eq(nowWatching.userId, userId));
  if (!row) return null;
  const next = { season: Math.min((row.season ?? 1) + 1, MAX_SEASON), episode: 1 };
  await db.update(nowWatching).set({ ...next, progress: null, updatedAt: new Date() }).where(eq(nowWatching.userId, userId));
  return next;
}
