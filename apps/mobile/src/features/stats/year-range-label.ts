import type { I18n } from "@/i18n";
import { presetOf, type YearPreset } from "./ranking-controls";
import "./stats.messages";

const decadeLabel = (t: I18n["t"], d: number) => (d < 2000 ? t("stats.ranking.decade", { short: String(d).slice(2) }) : t("stats.ranking.decadeFull", { year: d }));

/** The name of a release-year preset: "All", "Last 5 years", "'90s", "2000s". */
export function presetLabel(t: I18n["t"], p: YearPreset): string {
  if (p.id === "all") return t("stats.ranking.yearsAll");
  if (p.id.startsWith("last")) return t("stats.ranking.yearsLast", { count: Number(p.id.slice(4)) });
  return decadeLabel(t, Number(p.id.slice(1)));
}

/** The applied range as the button shows it: the preset's name when it is one, else "1990–1999", "1990–…" or "…–1999". */
export function yearRangeLabel(t: I18n["t"], range: { yearFrom?: number; yearTo?: number }, presets: YearPreset[]): string {
  const id = presetOf(range, presets);
  const p = presets.find((x) => x.id === id);
  return p ? presetLabel(t, p) : `${range.yearFrom ?? "…"}–${range.yearTo ?? "…"}`;
}
