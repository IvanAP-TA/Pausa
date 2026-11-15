// Raccomandazioni e confronto gusti (Fase 3). Mock del servizio Rust:
// stessa logica, in TypeScript. Tutto puro e testabile.

export interface RatingRow {
  userId: string;
  mediaId: string;
  rating: number | null;
}

/**
 * Somiglianza di gusto tra due utenti sui titoli votati in comune.
 * Ritorna 0..1 (1 = gusti identici), oppure null se non hanno titoli in comune.
 */
export function tasteSimilarity(a: RatingRow[], b: RatingRow[]): number | null {
  const mapA = new Map(a.filter((r) => r.rating != null).map((r) => [r.mediaId, r.rating as number]));
  const mapB = new Map(b.filter((r) => r.rating != null).map((r) => [r.mediaId, r.rating as number]));
  let sumDiff = 0;
  let n = 0;
  for (const [mediaId, ra] of mapA) {
    const rb = mapB.get(mediaId);
    if (rb == null) continue;
    sumDiff += Math.abs(ra - rb);
    n++;
  }
  if (n === 0) return null;
  // max diff per titolo = 4.5 (0.5..5). Normalizza a 0..1.
  return 1 - sumDiff / n / 4.5;
}

export interface CatalogItem {
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  type: "movie" | "tv" | "anime";
}

/**
 * Consigli di gruppo: titoli del catalogo non ancora loggati nella Cerchia,
 * ordinati per affinità col gusto del gruppo.
 * Affinità mock = posizione nel catalogo pesata (deterministica).
 */
export function recommend(
  catalog: CatalogItem[],
  loggedTmdbIds: Set<number>,
  limit = 6,
): CatalogItem[] {
  return catalog.filter((c) => !loggedTmdbIds.has(c.tmdbId)).slice(0, limit);
}

export interface MemberAvg {
  userId: string;
  name: string;
  count: number;
  avg: number | null;
}

/** Statistiche aggregate per Year in Review. */
export function aggregate(
  logs: { userId: string; rating: number | null; type: string }[],
  names: Record<string, string>,
) {
  const total = logs.length;
  const rated = logs.filter((l) => l.rating != null) as { userId: string; rating: number; type: string }[];
  const avg = rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : null;

  const byType: Record<string, number> = {};
  for (const l of logs) byType[l.type] = (byType[l.type] ?? 0) + 1;

  const perUser: Record<string, { count: number; sum: number; rated: number }> = {};
  for (const l of logs) {
    const u = (perUser[l.userId] ??= { count: 0, sum: 0, rated: 0 });
    u.count++;
    if (l.rating != null) {
      u.sum += l.rating;
      u.rated++;
    }
  }
  const members: MemberAvg[] = Object.entries(perUser).map(([userId, v]) => ({
    userId,
    name: names[userId] ?? "?",
    count: v.count,
    avg: v.rated ? v.sum / v.rated : null,
  }));
  members.sort((a, b) => b.count - a.count);

  return { total, avg, byType, members, mostActive: members[0] ?? null };
}
