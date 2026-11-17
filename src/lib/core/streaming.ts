import { and, eq, inArray } from "drizzle-orm";
import { mediaAvailabilityCheck, mediaProvider, user, userProvider } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* "Where can we watch it together": each person says which services they have, each title says where it streams
 * (TMDB watch providers, data by JustWatch), and the Serata can keep only titles on a service everyone has. */

export type Provider = { id: number; name: string; logoPath: string | null };

export const AVAILABILITY_TTL_MS = 7 * 86_400_000;

/** ISO 3166-1 alpha-2 countries Pausa offers; the list is TMDB's watch regions that matter for our three languages and neighbours. */
export const COUNTRIES = ["IT", "ES", "GB", "US", "FR", "DE", "PT", "MX", "AR", "CO", "CL", "CH", "IE", "CA", "AU"] as const;
export const defaultCountry = (locale: string) => ({ it: "IT", es: "ES", en: "GB" })[locale] ?? "IT";
export const isCountry = (v: unknown): v is (typeof COUNTRIES)[number] => (COUNTRIES as readonly unknown[]).includes(v);

type TmdbProvider = { provider_id: number; provider_name: string; logo_path?: string | null; display_priority?: number; display_priorities?: Record<string, number> };

/** Flat-rate ("included in a subscription") services for a title in a country, in TMDB's display order. */
export function parseWatchProviders(json: unknown, country: string): Provider[] {
  const entry = (json as { results?: Record<string, { flatrate?: TmdbProvider[] }> } | null)?.results?.[country];
  return (entry?.flatrate ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }));
}

/** The services worth offering in a country's settings: TMDB's list for that region, most prominent first. */
export function parseRegionProviders(json: unknown, country: string, limit = 24): Provider[] {
  const list = (json as { results?: TmdbProvider[] } | null)?.results ?? [];
  return list
    .slice()
    .sort((a, b) => (a.display_priorities?.[country] ?? a.display_priority ?? 999) - (b.display_priorities?.[country] ?? b.display_priority ?? 999))
    .slice(0, limit)
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }));
}

/**
 * Services every person who told us theirs has. People who set none are left out (we cannot filter on what we do not know);
 * if nobody set any, there is nothing to filter on.
 */
export function commonProviders(sets: Provider[][]): Provider[] {
  const known = sets.filter((s) => s.length > 0);
  if (known.length === 0) return [];
  return known[0].filter((p) => known.every((s) => s.some((q) => q.id === p.id)));
}

/** Which of the wanted services carry the title. */
export function onServices(titleProviders: Provider[] | undefined, wanted: Provider[]): Provider[] {
  if (!titleProviders) return [];
  return wanted.filter((w) => titleProviders.some((t) => t.id === w.id));
}

/* ───────────── Storage ───────────── */

export async function setUserProviders(db: AnyDb, input: { userId: string; country: string | null; providers: Provider[] }) {
  await db.update(user).set({ country: input.country }).where(eq(user.id, input.userId));
  await db.delete(userProvider).where(eq(userProvider.userId, input.userId));
  const unique = [...new Map(input.providers.map((p) => [p.id, p])).values()].slice(0, 40);
  if (unique.length) await db.insert(userProvider).values(unique.map((p) => ({ userId: input.userId, providerId: p.id, name: p.name, logoPath: p.logoPath })));
}

export async function getUserProviders(db: AnyDb, userIds: string[]) {
  const out = new Map<string, Provider[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return out;
  const rows = await db.select().from(userProvider).where(inArray(userProvider.userId, userIds));
  for (const r of rows) out.get(r.userId)?.push({ id: r.providerId, name: r.name, logoPath: r.logoPath });
  return out;
}

export async function storeAvailability(db: AnyDb, input: { mediaId: string; country: string; providers: Provider[]; now?: Date }) {
  const { mediaId, country } = input;
  await db.delete(mediaProvider).where(and(eq(mediaProvider.mediaId, mediaId), eq(mediaProvider.country, country)));
  if (input.providers.length) {
    await db.insert(mediaProvider).values(input.providers.map((p) => ({ mediaId, country, providerId: p.id, name: p.name, logoPath: p.logoPath })));
  }
  const fetchedAt = input.now ?? new Date();
  await db.insert(mediaAvailabilityCheck).values({ mediaId, country, fetchedAt }).onConflictDoUpdate({ target: [mediaAvailabilityCheck.mediaId, mediaAvailabilityCheck.country], set: { fetchedAt } });
}

/**
 * Known availability for some titles. `known` has an entry (maybe empty) for every title looked up recently;
 * `stale` lists the ones never checked or older than the TTL, for the caller to refresh.
 */
export async function getAvailability(db: AnyDb, mediaIds: string[], country: string, now = new Date()) {
  const known = new Map<string, Provider[]>();
  const stale: string[] = [];
  if (mediaIds.length === 0) return { known, stale };
  const [checks, rows] = await Promise.all([
    db.select().from(mediaAvailabilityCheck).where(and(inArray(mediaAvailabilityCheck.mediaId, mediaIds), eq(mediaAvailabilityCheck.country, country))),
    db.select().from(mediaProvider).where(and(inArray(mediaProvider.mediaId, mediaIds), eq(mediaProvider.country, country))),
  ]);
  const fresh = new Set(checks.filter((c) => now.getTime() - c.fetchedAt.getTime() < AVAILABILITY_TTL_MS).map((c) => c.mediaId));
  for (const id of mediaIds) {
    if (fresh.has(id)) known.set(id, []);
    else stale.push(id);
  }
  for (const r of rows) if (fresh.has(r.mediaId)) known.get(r.mediaId)?.push({ id: r.providerId, name: r.name, logoPath: r.logoPath });
  return { known, stale };
}
