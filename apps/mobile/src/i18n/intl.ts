// Web build of ./intl.native.ts: every browser Pausa supports has these Intl classes, so the web bundle carries no fallback
// tables (the shared chunk is on a budget). The native build (Hermes, which lacks them) picks intl.native.ts.

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type Plural = { select: (n: number) => PluralCategory };
export type TimeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

export const pluralRules = (locale: string, ordinal: boolean): Plural => new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" }) as Plural;
export const relativeTimeFormat = (locale: string) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
export const listFormat = (locale: string, items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
export function regionName(locale: string): (code: string) => string {
  const names = new Intl.DisplayNames(locale, { type: "region" });
  return (code) => names.of(code) ?? code;
}
