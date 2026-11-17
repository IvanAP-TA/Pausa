import { onServices, type Provider } from "./streaming";

/* "Fill the roster for us": a Serata needs a short list people actually want. Instead of making the host search for
 * eight titles, start from what the group already wants (watchlist) and what the group would love (recommendations),
 * drop what most of them have seen, and, when people told us their services, what they cannot all stream. */

export type RosterTitle = { id: string; kind: "movie" | "tv" | "anime"; title: string; year: number | null; posterPath: string | null };

export type RosterInput = {
  watchlist: RosterTitle[]; // titles on the group's lists, in list order
  recommended: (RosterTitle & { score: number })[]; // from the group recommender
  seenBy: Map<string, number>; // how many of the people have logged each title
  people: number;
  common: Provider[]; // services everyone who set theirs has; empty = no filter
  availability: Map<string, Provider[]>; // known availability; a title missing here is unknown, not unavailable
  max?: number;
};

/** True when a title should stay out because we know the group cannot stream it together. */
export function blockedByServices(id: string, common: Provider[], availability: Map<string, Provider[]>) {
  if (common.length === 0) return false;
  const where = availability.get(id);
  if (where === undefined) return false; // unknown: do not hide it
  return onServices(where, common).length === 0;
}

/**
 * Up to `max` titles: recommendations and watchlist titles alternate (so one source cannot crowd out the other),
 * best recommendation first. A title is dropped when half or more of the group has already seen it, or when the group's
 * shared services are known and do not carry it.
 */
export function buildRoster(input: RosterInput): RosterTitle[] {
  const max = input.max ?? 8;
  const tooSeen = (id: string) => input.people > 0 && (input.seenBy.get(id) ?? 0) * 2 >= input.people;
  const ok = (t: RosterTitle) => !tooSeen(t.id) && !blockedByServices(t.id, input.common, input.availability);

  const recs = [...input.recommended].sort((a, b) => b.score - a.score).filter(ok);
  const lists = input.watchlist.filter(ok);
  const out: RosterTitle[] = [];
  const taken = new Set<string>();
  const take = (t: RosterTitle | undefined) => {
    if (!t || taken.has(t.id) || out.length >= max) return;
    taken.add(t.id);
    out.push({ id: t.id, kind: t.kind, title: t.title, year: t.year, posterPath: t.posterPath });
  };
  for (let i = 0; out.length < max && (i < recs.length || i < lists.length); i++) {
    take(recs[i]);
    take(lists[i]);
  }
  return out;
}
