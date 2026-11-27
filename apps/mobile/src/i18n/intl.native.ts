// Native build (Metro picks .native.ts on Android/iOS; the web gets ./intl.ts). The Intl pieces the app uses that Hermes (the JavaScript engine of the Android and iOS builds) does not have: PluralRules,
// RelativeTimeFormat, ListFormat, DisplayNames. Hermes has Collator, DateTimeFormat and NumberFormat only, so `new
// Intl.PluralRules(...)` throws "undefined cannot be used as a constructor" and the whole screen fails (seen on the Android
// emulator, 27 Nov 2026). Each helper uses the engine's own class when it exists (every browser) and otherwise a small rule
// set for the app's three languages, written to give the same words the browsers give.

type Locale3 = "it" | "en" | "es";
const lang = (locale: string): Locale3 => (locale.startsWith("en") ? "en" : locale.startsWith("es") ? "es" : "it");
const has = (name: "PluralRules" | "RelativeTimeFormat" | "ListFormat" | "DisplayNames") =>
  typeof Intl !== "undefined" && typeof (Intl as unknown as Record<string, unknown>)[name] === "function";

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type Plural = { select: (n: number) => PluralCategory };

/** CLDR rules for it/en/es (integers and decimals as the browsers treat them). */
export function fallbackPlural(locale: string, ordinal: boolean): Plural {
  const l = lang(locale);
  return {
    select(n) {
      const int = Number.isInteger(n);
      if (ordinal) {
        if (l === "en" && int) {
          const m10 = n % 10, m100 = n % 100;
          if (m10 === 1 && m100 !== 11) return "one";
          if (m10 === 2 && m100 !== 12) return "two";
          if (m10 === 3 && m100 !== 13) return "few";
        }
        if (l === "it" && int && [8, 11, 80, 800].includes(n)) return "many";
        return "other";
      }
      if (n === 1 && int) return "one";
      // it/es "many": a non-zero multiple of a million (1000000 → "many"), as CLDR 42+ and the browsers say
      if ((l === "it" || l === "es") && int && n !== 0 && n % 1_000_000 === 0) return "many";
      return "other";
    },
  };
}

export function pluralRules(locale: string, ordinal: boolean): Plural {
  if (has("PluralRules")) return new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" }) as Plural;
  return fallbackPlural(locale, ordinal);
}

export type TimeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
type Rtf = { format: (value: number, unit: TimeUnit) => string };

const UNITS: Record<Locale3, Record<TimeUnit, [string, string]>> = {
  it: { second: ["secondo", "secondi"], minute: ["minuto", "minuti"], hour: ["ora", "ore"], day: ["giorno", "giorni"], week: ["settimana", "settimane"], month: ["mese", "mesi"], year: ["anno", "anni"] },
  en: { second: ["second", "seconds"], minute: ["minute", "minutes"], hour: ["hour", "hours"], day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], year: ["year", "years"] },
  es: { second: ["segundo", "segundos"], minute: ["minuto", "minutos"], hour: ["hora", "horas"], day: ["día", "días"], week: ["semana", "semanas"], month: ["mes", "meses"], year: ["año", "años"] },
};
// numeric: "auto" words (what the browsers say for -1, 0, +1)
const AUTO: Record<Locale3, Partial<Record<TimeUnit, Record<number, string>>>> = {
  it: {
    second: { 0: "ora" },
    minute: { 0: "questo minuto" },
    hour: { 0: "quest’ora" },
    day: { [-2]: "l’altro ieri", [-1]: "ieri", 0: "oggi", 1: "domani", 2: "dopodomani" },
    week: { [-1]: "settimana scorsa", 0: "questa settimana", 1: "settimana prossima" },
    month: { [-1]: "mese scorso", 0: "questo mese", 1: "mese prossimo" },
    year: { [-1]: "anno scorso", 0: "quest’anno", 1: "anno prossimo" },
  },
  en: {
    second: { 0: "now" },
    minute: { 0: "this minute" },
    hour: { 0: "this hour" },
    day: { [-1]: "yesterday", 0: "today", 1: "tomorrow" },
    week: { [-1]: "last week", 0: "this week", 1: "next week" },
    month: { [-1]: "last month", 0: "this month", 1: "next month" },
    year: { [-1]: "last year", 0: "this year", 1: "next year" },
  },
  es: {
    second: { 0: "ahora" },
    minute: { 0: "este minuto" },
    hour: { 0: "esta hora" },
    day: { [-2]: "anteayer", [-1]: "ayer", 0: "hoy", 1: "mañana", 2: "pasado mañana" },
    week: { [-1]: "la semana pasada", 0: "esta semana", 1: "la próxima semana" },
    month: { [-1]: "el mes pasado", 0: "este mes", 1: "el próximo mes" },
    year: { [-1]: "el año pasado", 0: "este año", 1: "el próximo año" },
  },
};

/** `numeric: "auto"` relative time, as `Intl.RelativeTimeFormat` writes it in it/en/es. */
export function fallbackRelativeTime(locale: string): Rtf {
  const l = lang(locale);
  return {
    format(value, unit) {
      const word = AUTO[l][unit]?.[value];
      if (word) return word;
      const n = Math.abs(value);
      const name = UNITS[l][unit][n === 1 ? 0 : 1];
      const past = value < 0 || Object.is(value, -0);
      if (l === "it") return past ? `${n} ${name} fa` : `tra ${n} ${name}`;
      if (l === "es") return past ? `hace ${n} ${name}` : `dentro de ${n} ${name}`;
      return past ? `${n} ${name} ago` : `in ${n} ${name}`;
    },
  };
}

export function relativeTimeFormat(locale: string): Rtf {
  if (has("RelativeTimeFormat")) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }) as Rtf;
  return fallbackRelativeTime(locale);
}

/** "Marco, Sofi e Giulia": `Intl.ListFormat` conjunction, or the same words by hand. */
export function fallbackList(locale: string, items: string[]): string {
  const and = { it: "e", en: "and", es: "y" }[lang(locale)];
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${and} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}${lang(locale) === "en" ? "," : ""} ${and} ${items[items.length - 1]}`;
}

export function listFormat(locale: string, items: string[]): string {
  if (has("ListFormat")) return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  return fallbackList(locale, items);
}

/** A country's name in the app's language; without `Intl.DisplayNames` the two-letter code (still unambiguous). */
export function regionName(locale: string): (code: string) => string {
  if (has("DisplayNames")) {
    const names = new Intl.DisplayNames(locale, { type: "region" });
    return (code) => names.of(code) ?? code;
  }
  return (code) => code;
}
