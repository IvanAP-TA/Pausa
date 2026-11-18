/* What a title is about: synopsis, genres, leading cast. Pure parsers for what TMDB and AniList answer, so they can be tested
 * without a network; the lookup and the cache live in lib/media-detail.ts. */

export type CastMember = { name: string; role: string | null };
export type Details = { overview: string | null; genres: string[]; cast: CastMember[]; runtimeMin: number | null };

export const MAX_OVERVIEW = 1200;
export const MAX_CAST = 6;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** A synopsis kept short enough to read on a phone: cut at a sentence when it can be. */
export function trimOverview(raw: string | null, max = MAX_OVERVIEW): string | null {
  const s = text(raw);
  if (!s) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "…").trim();
}

/** TMDB `/movie/{id}` or `/tv/{id}` with `append_to_response=credits`. */
export function parseTmdbDetails(json: unknown): Details {
  const j = obj(json);
  const runtime = typeof j.runtime === "number" && j.runtime > 0 ? j.runtime : typeof list(j.episode_run_time)[0] === "number" ? (list(j.episode_run_time)[0] as number) : null;
  return {
    overview: trimOverview(text(j.overview)),
    genres: list(j.genres).map((g) => text(obj(g).name)).filter((g): g is string => g !== null).slice(0, 4),
    cast: list(obj(j.credits).cast)
      .map((c) => ({ name: text(obj(c).name), role: text(obj(c).character) }))
      .filter((c): c is CastMember => c.name !== null)
      .slice(0, MAX_CAST),
    runtimeMin: runtime,
  };
}

/** AniList writes its descriptions with a little HTML (<br>, <i>) and source notes in brackets at the end. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\n{2,}\(Source:[^)]*\)\s*$/i, "")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** AniList `Media { description genres duration }`. */
export function parseAniListDetails(json: unknown): Details {
  const m = obj(obj(obj(json).data).Media);
  const description = text(m.description);
  return {
    overview: trimOverview(description ? plainText(description) : null),
    genres: list(m.genres).map(text).filter((g): g is string => g !== null).slice(0, 4),
    cast: [],
    runtimeMin: typeof m.duration === "number" && m.duration > 0 ? m.duration : null,
  };
}
