import { describe, it, expect } from "vitest";
import { bracketPairs, advanceRound, pickWinner, isComplete } from "@/modules/serata/bracket";

describe("bracket", () => {
  it("pairs even list", () => {
    expect(bracketPairs(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("gives a bye on odd list", () => {
    expect(bracketPairs(["a", "b", "c"])).toEqual([["a", "b"], ["c", null]]);
  });

  it("advances picks and byes", () => {
    const pairs = bracketPairs(["a", "b", "c"]);
    const survivors = advanceRound(pairs, { 0: "b" });
    expect(survivors).toEqual(["b", "c"]);
  });

  it("pickWinner counts votes, tie to a", () => {
    expect(pickWinner("a", "b", [{ mediaEntityId: "b" }, { mediaEntityId: "b" }, { mediaEntityId: "a" }])).toBe("b");
    expect(pickWinner("a", "b", [{ mediaEntityId: "a" }, { mediaEntityId: "b" }])).toBe("a");
  });

  it("isComplete when one left", () => {
    expect(isComplete(["a"])).toBe(true);
    expect(isComplete(["a", "b"])).toBe(false);
  });
});
