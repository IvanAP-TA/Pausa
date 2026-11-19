import { circle, circleMember, log, mediaEntity, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* The app-store review account. Google Play (and similar reviews) must be able to open the app fully, but they cannot receive a
 * sign-in email. So the operator sets REVIEW_EMAIL + REVIEW_PASSWORD and a reviewer signs in at /<locale>/review. This builds what
 * that person sees: one demo Cerchia ("Demo circle") they administer, two made-up members and a few films with ratings.
 * Everything has a fixed id and is inserted with "do nothing on conflict", so calling it on every sign-in is safe. */

export const REVIEW_CIRCLE_ID = "c-review";

const FILMS = [
  { id: "m-review-1", title: "Nosferatu", year: 1922, runtime: 94 },
  { id: "m-review-2", title: "Metropolis", year: 1927, runtime: 153 },
  { id: "m-review-3", title: "The Cabinet of Dr. Caligari", year: 1920, runtime: 76 },
  { id: "m-review-4", title: "A Trip to the Moon", year: 1902, runtime: 14 },
  { id: "m-review-5", title: "The General", year: 1926, runtime: 78 },
  { id: "m-review-6", title: "Battleship Potemkin", year: 1925, runtime: 75 },
];

// [film index, rating in half stars, day offset, review]
const WATCHED: Record<string, [number, number | null, number, string | null][]> = {
  "u-review": [[0, 9, 2, "Still creepy after a hundred years."], [1, 10, 6, null], [4, 8, 14, "Great stunts."]],
  "u-review-anna": [[0, 8, 2, null], [2, 7, 9, "Weird sets, loved them."], [3, 9, 20, null]],
  "u-review-marco": [[1, 9, 6, "A bit long, worth it."], [4, 7, 14, null], [5, 8, 25, null]],
};

const isoDay = (offset: number, now: Date) => new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

/** Makes sure the review account and its demo Cerchia exist. Returns the Cerchia id. */
export async function ensureReviewAccount(db: AnyDb, email: string, now = new Date()): Promise<{ userId: string; circleId: string }> {
  const people = [
    { id: "u-review", name: "Reviewer", email },
    { id: "u-review-anna", name: "Anna (demo)", email: "anna@review.invalid" },
    { id: "u-review-marco", name: "Marco (demo)", email: "marco@review.invalid" },
  ];
  for (const p of people) {
    await db.insert(user).values({ ...p, emailVerified: true, isAnonymous: false, locale: "en" }).onConflictDoNothing();
  }
  await db.insert(circle).values({ id: REVIEW_CIRCLE_ID, name: "Demo circle", description: "A small demo group for app review.", createdBy: "u-review" }).onConflictDoNothing();
  for (const p of people) {
    await db.insert(circleMember).values({ circleId: REVIEW_CIRCLE_ID, userId: p.id, role: p.id === "u-review" ? "admin" : "member" }).onConflictDoNothing();
  }
  await db.insert(mediaEntity).values(FILMS.map((f) => ({ id: f.id, kind: "movie" as const, originalTitle: f.title, year: f.year, runtimeMin: f.runtime }))).onConflictDoNothing();
  for (const [uid, rows] of Object.entries(WATCHED)) {
    await db.insert(log).values(rows.map(([film, rating, days, review], i) => ({
      id: `l-review-${uid}-${i}`, userId: uid, mediaId: FILMS[film]!.id, watchedOn: isoDay(days, now), rating, review, scope: "circles" as const,
    }))).onConflictDoNothing();
  }
  return { userId: "u-review", circleId: REVIEW_CIRCLE_ID };
}
