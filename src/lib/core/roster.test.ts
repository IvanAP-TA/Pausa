import { describe, expect, it } from "vitest";
import { blockedByServices, buildRoster, type RosterInput, type RosterTitle } from "./roster";
import type { Provider } from "./streaming";

const t = (id: string): RosterTitle => ({ id, kind: "movie", title: id.toUpperCase(), year: 2020, posterPath: null });
const nf: Provider = { id: 8, name: "Netflix", logoPath: null };
const prime: Provider = { id: 119, name: "Prime", logoPath: null };

const base = (over: Partial<RosterInput> = {}): RosterInput => ({
  watchlist: [], recommended: [], seenBy: new Map(), people: 4, common: [], availability: new Map(), ...over,
});

describe("buildRoster", () => {
  it("alternates recommendations (best first) with the watchlist, without duplicates", () => {
    const r = buildRoster(base({
      recommended: [{ ...t("r1"), score: 7 }, { ...t("r2"), score: 9 }],
      watchlist: [t("w1"), t("r2"), t("w2")],
    }));
    expect(r.map((x) => x.id)).toEqual(["r2", "w1", "r1", "w2"]);
  });

  it("caps at the maximum", () => {
    const watchlist = Array.from({ length: 12 }, (_, i) => t(`w${i}`));
    expect(buildRoster(base({ watchlist }))).toHaveLength(8);
    expect(buildRoster(base({ watchlist, max: 5 }))).toHaveLength(5);
  });

  it("drops titles half the group has already seen", () => {
    const r = buildRoster(base({ watchlist: [t("a"), t("b"), t("c")], seenBy: new Map([["a", 2], ["b", 1]]) }));
    expect(r.map((x) => x.id)).toEqual(["b", "c"]); // a: 2 of 4 has seen it
  });

  it("drops titles the shared services are known not to carry, keeps unknown ones", () => {
    const availability = new Map<string, Provider[]>([["a", [nf]], ["b", [prime]], ["c", []]]);
    const r = buildRoster(base({ watchlist: [t("a"), t("b"), t("c"), t("d")], common: [nf], availability }));
    expect(r.map((x) => x.id)).toEqual(["a", "d"]); // b is only on Prime, c on nothing, d is unknown
  });

  it("does not filter by services when nobody set any", () => {
    expect(blockedByServices("a", [], new Map([["a", []]]))).toBe(false);
  });

  it("returns an empty roster when there is nothing to suggest", () => {
    expect(buildRoster(base())).toEqual([]);
  });
});
