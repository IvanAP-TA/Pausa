// apps/mobile/src/features/stats/ranking-controls.ts
export type SortKey = "avg" | "votes" | "year";
export type SortState = { key: SortKey; dir: "desc" | "asc" } | null;

/** One sort at a time: first click desc, second asc, third off (the list falls back to best average first). */
export function nextSort(state: SortState, clicked: SortKey): SortState {
  if (!state || state.key !== clicked) return { key: clicked, dir: "desc" };
  return state.dir === "desc" ? { key: clicked, dir: "asc" } : null;
}

export type YearPreset = { id: string; yearFrom?: number; yearTo?: number };

/** "All", the last 1/5/10/20 years, then one decade per decade that holds at least one title (release year). */
export function yearPresets(now: number, yearMin: number | null, yearMax: number | null): YearPreset[] {
  const out: YearPreset[] = [{ id: "all" }, ...[1, 5, 10, 20].map((n) => ({ id: `last${n}`, yearFrom: now - n }))];
  if (yearMin === null || yearMax === null) return out;
  for (let d = Math.floor(yearMin / 10) * 10; d <= yearMax; d += 10) out.push({ id: `d${d}`, yearFrom: d, yearTo: d + 9 });
  return out;
}

export function presetOf(range: { yearFrom?: number; yearTo?: number }, presets: YearPreset[]): string {
  const hit = presets.find((p) => p.yearFrom === range.yearFrom && p.yearTo === range.yearTo);
  return hit ? hit.id : "custom";
}

export function splitVotes<T>(all: T[], open: boolean, max = 3): { shown: T[]; hidden: number } {
  if (open || all.length <= max) return { shown: all, hidden: 0 };
  return { shown: all.slice(0, max), hidden: all.length - max };
}
