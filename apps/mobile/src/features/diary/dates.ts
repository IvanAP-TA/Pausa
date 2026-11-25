/** ts-rs writes `i64` as `bigint`, but JSON delivers plain numbers: read them as numbers. */
export const num = (v: bigint | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/** `2026-11-03` as the local midnight of that day (never through UTC, which would show the day before in some timezones). */
export function ymdToMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export const msToYmd = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const todayYmd = () => msToYmd(Date.now());

/** A real calendar day written `YYYY-MM-DD` (2026-02-30 is not). */
export const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && msToYmd(ymdToMs(v)) === v;

/**
 * The same title can come back twice from `/api/media/search`: once as `local:<id>` (Pausa already holds it) and once from the
 * catalogue (`tmdb:…`). Keeps the first of each kind + title + year, and the local one wins (nothing new is stored when it is picked).
 */
export function dedupeCandidates<T extends { key: string; kind: string; title: string; year: bigint | number | null }>(items: T[]): T[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const id = (c: T) => `${c.kind}|${norm(c.title)}|${c.year === null ? "" : Number(c.year)}`;
  const local = new Set(items.filter((c) => c.key.startsWith("local:")).map(id));
  const seen = new Set<string>();
  return items.filter((c) => {
    const k = id(c);
    if (!c.key.startsWith("local:") && local.has(k)) return false;
    if (seen.has(`${c.key}`)) return false;
    seen.add(c.key);
    return true;
  });
}
