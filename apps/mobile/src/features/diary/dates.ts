import { relativeTimeFormat } from "@/i18n/intl";
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

/**
 * v1 `format.relativeTime(then, now)` (next-intl): the largest unit that fits, rounded, "2 ore fa", "ieri", "3 settimane fa".
 * Under a minute it is "adesso" (seconds would tick and say nothing).
 */
export function relativeTime(then: number, now: number, locale: string): string {
  const rtf = relativeTimeFormat(locale);
  const s = (then - now) / 1000;
  const a = Math.abs(s);
  if (a < 60) return rtf.format(0, "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 604_800) return rtf.format(Math.round(s / 86_400), "day");
  if (a < 2_629_800) return rtf.format(Math.round(s / 604_800), "week");
  if (a < 31_557_600) return rtf.format(Math.round(s / 2_629_800), "month");
  return rtf.format(Math.round(s / 31_557_600), "year");
}

/** v1 diary days: a day of the app's time zone ("YYYY-MM-DD", local). */
export const dayKey = (ms: number) => msToYmd(ms);

/** The name of a diary day: oggi, ieri, or the weekday ("lunedì"). */
export function dayName(ms: number, now: number, locale: string): string {
  const rtf = relativeTimeFormat(locale);
  if (dayKey(ms) === dayKey(now)) return rtf.format(0, "day");
  if (dayKey(ms) === dayKey(now - 86_400_000)) return rtf.format(-1, "day");
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(ms);
}
