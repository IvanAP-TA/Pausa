import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { circleMember, favorite, log, logShare, mediaEntity, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* The profile: who I am in Pausa (name, picture, a few lines, the genres and the titles I love), and what I can undo
 * about what I put in a Cerchia. Pure data functions on any SQLite (D1 in the app, sql.js in the tests). */

/** Genres a person can pin on their profile. Keys are stored; the words come from the translations (profile.genres.*). */
export const GENRES = [
  "action", "adventure", "animation", "anime", "comedy", "crime", "documentary", "drama", "family", "fantasy",
  "history", "horror", "musical", "mystery", "romance", "scifi", "thriller", "war", "western",
] as const;
export type Genre = (typeof GENRES)[number];
export const MAX_GENRES = 5;
export const MAX_FAVORITES = 5;
export const MAX_BIO = 280;

export const isGenre = (v: unknown): v is Genre => (GENRES as readonly unknown[]).includes(v);

export async function getProfile(db: AnyDb, userId: string) {
  const [row] = await db.select({ id: user.id, name: user.name, image: user.image, bio: user.bio, favoriteGenres: user.favoriteGenres })
    .from(user).where(eq(user.id, userId));
  if (!row) return null;
  const favorites = await db
    .select({ id: mediaEntity.id, title: mediaEntity.originalTitle, posterPath: mediaEntity.posterPath, kind: mediaEntity.kind, year: mediaEntity.year })
    .from(favorite).innerJoin(mediaEntity, eq(mediaEntity.id, favorite.mediaId))
    .where(eq(favorite.userId, userId)).orderBy(asc(favorite.position));
  return { ...row, favoriteGenres: (row.favoriteGenres ?? []).filter(isGenre), favorites };
}

/** Name, picture, bio and genres in one go; the picture is only changed when given (undefined = keep). */
export async function saveProfile(db: AnyDb, input: { userId: string; name: string; bio: string; genres: string[]; image?: string | null }) {
  const genres = [...new Set(input.genres.filter(isGenre))].slice(0, MAX_GENRES);
  const bio = input.bio.trim().slice(0, MAX_BIO) || null;
  await db.update(user)
    .set({ name: input.name.trim(), bio, favoriteGenres: genres, ...(input.image !== undefined ? { image: input.image } : {}), updatedAt: new Date() })
    .where(eq(user.id, input.userId));
}

/** Pins a title at the end of the shelf; no-op if it is already there or the shelf is full. */
export async function addFavorite(db: AnyDb, userId: string, mediaId: string): Promise<{ ok: true } | { error: "full" }> {
  const current = await db.select({ mediaId: favorite.mediaId, position: favorite.position }).from(favorite).where(eq(favorite.userId, userId));
  if (current.some((f) => f.mediaId === mediaId)) return { ok: true };
  if (current.length >= MAX_FAVORITES) return { error: "full" };
  const next = current.reduce((m, f) => Math.max(m, f.position + 1), 0);
  await db.insert(favorite).values({ userId, mediaId, position: next }).onConflictDoNothing();
  return { ok: true };
}

export async function removeFavorite(db: AnyDb, userId: string, mediaId: string) {
  await db.delete(favorite).where(and(eq(favorite.userId, userId), eq(favorite.mediaId, mediaId)));
}

/** The word that has to be typed to take one's viewings out of a Cerchia: always the same, so it is never typed by accident. */
export const CONFIRM_WORD = "PAUSA";
export const confirms = (typed: unknown) => typeof typed === "string" && typed.trim().toUpperCase() === CONFIRM_WORD;

/**
 * Takes all of my viewings out of one Cerchia, and only that one. Nothing is deleted: the viewings stay in my space.
 * - A viewing shared with all my Cerchie ("circles") becomes private and is shared one by one with every other Cerchia
 *   I am in, at its original moment, so those diaries do not change.
 * - A private viewing I had added to this Cerchia is taken out of it.
 * Returns how many viewings left the Cerchia.
 */
export async function removeMyLogsFromCircle(db: AnyDb, input: { userId: string; circleId: string }): Promise<{ removed: number }> {
  const [member] = await db.select({ userId: circleMember.userId }).from(circleMember)
    .where(and(eq(circleMember.userId, input.userId), eq(circleMember.circleId, input.circleId)));
  if (!member) return { removed: 0 }; // not my Cerchia: nothing of mine is shown there
  const others = await db.select({ circleId: circleMember.circleId }).from(circleMember)
    .where(and(eq(circleMember.userId, input.userId), ne(circleMember.circleId, input.circleId)));
  const open = await db.select({ id: log.id, createdAt: log.createdAt }).from(log)
    .where(and(eq(log.userId, input.userId), eq(log.scope, "circles")));
  const mine = db.select({ id: log.id }).from(log).where(eq(log.userId, input.userId));
  const shared = await db.select({ logId: logShare.logId }).from(logShare)
    .where(and(eq(logShare.circleId, input.circleId), inArray(logShare.logId, mine)));

  // Small writes, in chunks: D1 caps the variables of one statement.
  for (let i = 0; i < open.length; i += 40) {
    const part = open.slice(i, i + 40);
    await db.update(log).set({ scope: "private" }).where(inArray(log.id, part.map((l) => l.id)));
    const rows = part.flatMap((l) => others.map((o) => ({ logId: l.id, circleId: o.circleId, createdAt: l.createdAt })));
    for (let j = 0; j < rows.length; j += 25) await db.insert(logShare).values(rows.slice(j, j + 25)).onConflictDoNothing();
  }
  for (let i = 0; i < shared.length; i += 80) {
    await db.delete(logShare).where(and(eq(logShare.circleId, input.circleId), inArray(logShare.logId, shared.slice(i, i + 80).map((s) => s.logId))));
  }
  return { removed: open.length + shared.length };
}

