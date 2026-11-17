import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { getCircleLists, type MediaSummary } from "./data";
import { rankDiscovery, topSeeds, type Ranked } from "./core/discovery";
import { loadCircleFacts, recommend } from "./core/insights";
import { buildRoster } from "./core/roster";
import { commonProviders, defaultCountry, getUserProviders, isCountry, onServices, type Provider } from "./core/streaming";
import { ensureAvailability, similarTitles, tmdbEnabled } from "./tmdb";

/* Glue between the pure modules in core/ and TMDB: what to watch next, and who can stream what. */

export async function countryOf(userId: string, locale: string) {
  const db = await getDb();
  const [u] = await db.select({ country: s.user.country }).from(s.user).where(eq(s.user.id, userId));
  return isCountry(u?.country) ? u.country : defaultCountry(locale);
}

export type Pick = Ranked & { on: Provider[] };

/**
 * "For you": TMDB recommendations for the titles this person loved, merged and ranked, never what they already logged.
 * `on` lists which of their own services carry each pick (empty when they have not set any, or when it is on none of them).
 */
export async function personalPicks(userId: string, locale: string, limit = 8): Promise<{ enabled: boolean; seeded: number; picks: Pick[] }> {
  if (!tmdbEnabled()) return { enabled: false, seeded: 0, picks: [] };
  const db = await getDb();
  const { seeds, logged } = await topSeeds(db, userId, 5, locale);
  if (seeds.length === 0) return { enabled: true, seeded: 0, picks: [] };

  const lists = await Promise.all(seeds.map(async (seed) => ({ seed, candidates: await similarTitles(seed.tmdbId, seed.kind, locale) })));
  const ranked = rankDiscovery(lists, logged, limit);

  const country = await countryOf(userId, locale);
  const mine = (await getUserProviders(db, [userId])).get(userId) ?? [];
  const known = mine.length ? await ensureAvailability(ranked.map((r) => r.candidate.id), country) : new Map<string, Provider[]>();
  return { enabled: true, seeded: seeds.length, picks: ranked.map((r) => ({ ...r, on: onServices(known.get(r.candidate.id), mine) })) };
}

/** What the Cerchia can stream together: the services every member who set theirs has. */
export async function circleServices(circleId: string) {
  const db = await getDb();
  const members = await db.select({ id: s.circleMember.userId }).from(s.circleMember).where(eq(s.circleMember.circleId, circleId));
  const byUser = await getUserProviders(db, members.map((m) => m.id));
  const sets = [...byUser.values()];
  return { common: commonProviders(sets), setBy: sets.filter((x) => x.length > 0).length, members: members.length };
}

/**
 * A suggested Serata roster: the group's watchlist plus what it would love, minus what most have seen and, when
 * services are known, what cannot be streamed together. Needs no TMDB token (it uses what Pausa already holds).
 */
export async function suggestedRoster(circleId: string, viewerId: string, locale: string): Promise<{ titles: MediaSummary[]; on: Record<string, string[]> }> {
  const db = await getDb();
  const [{ people, facts, watching }, lists, services, country] = await Promise.all([
    loadCircleFacts(db, circleId, locale), getCircleLists(circleId, locale), circleServices(circleId), countryOf(viewerId, locale),
  ]);

  const seenBy = new Map<string, number>();
  for (const id of new Set(facts.map((f) => f.mediaId))) seenBy.set(id, new Set(facts.filter((f) => f.mediaId === id).map((f) => f.userId)).size);

  const watchlist = [...lists].sort((a, b) => Number(b.kind === "watchlist") - Number(a.kind === "watchlist")).flatMap((l) => l.items);
  const recommended = recommend(facts, people, 12, watching).map((r) => ({
    id: r.mediaId, kind: r.kind, title: r.title, year: r.year, posterPath: r.posterPath, score: r.score,
  }));

  const candidateIds = [...new Set([...watchlist.map((w) => w.id), ...recommended.map((r) => r.id)])].slice(0, 30);
  const availability = services.common.length ? await ensureAvailability(candidateIds, country) : new Map<string, Provider[]>();

  let titles = buildRoster({ watchlist, recommended, seenBy, people: people.length, common: services.common, availability });

  // Not enough in what the group already has: top up with TMDB suggestions seeded from the titles the group rated best.
  if (titles.length < 6 && tmdbEnabled()) {
    const avg = new Map<string, { sum: number; n: number }>();
    for (const f of facts) if (f.rating !== null) { const a = avg.get(f.mediaId) ?? { sum: 0, n: 0 }; a.sum += f.rating; a.n += 1; avg.set(f.mediaId, a); }
    const best = [...avg].map(([id, a]) => ({ id, score: a.sum / a.n })).filter((x) => x.score >= 8).sort((a, b) => b.score - a.score).slice(0, 3);
    if (best.length) {
      const rows = await db.select({ id: s.mediaEntity.id, tmdbId: s.mediaEntity.tmdbId, kind: s.mediaEntity.kind }).from(s.mediaEntity).where(inArray(s.mediaEntity.id, best.map((b) => b.id)));
      const lists = await Promise.all(rows.filter((r) => r.tmdbId).map(async (r) => ({
        seed: { mediaId: r.id, title: "", rating: Math.round(best.find((b) => b.id === r.id)!.score) },
        candidates: await similarTitles(r.tmdbId!, r.kind, locale),
      })));
      const extra = rankDiscovery(lists, new Set(seenBy.keys()), 12).map((r) => r.candidate);
      const extraAvail = services.common.length ? await ensureAvailability(extra.map((e) => e.id), country) : new Map<string, Provider[]>();
      for (const [id, v] of extraAvail) availability.set(id, v);
      titles = buildRoster({ watchlist: [...watchlist, ...extra], recommended, seenBy, people: people.length, common: services.common, availability });
    }
  }
  const on: Record<string, string[]> = {};
  for (const t of titles) on[t.id] = onServices(availability.get(t.id), services.common).map((p) => p.name);
  return { titles, on };
}
