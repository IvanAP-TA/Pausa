import { describe, expect, it } from "vitest";
import { closeMatch, closeTable, currentMatch, initBracket, initTable, matchProgress, roundName, validBallot } from "./engine";

const T0 = 1_000_000;

function playOut(seeds: string[], pickA = true) {
  let s = initBracket(seeds, T0);
  let guard = 0;
  while (!s.winner && guard++ < 20) s = closeMatch(s, pickA ? { a: 1, b: 0 } : { a: 0, b: 1 }, 0, T0);
  return s;
}

describe("bracket", () => {
  it("8 seeds: 7 matches, quarters first, top seed wins when A always wins", () => {
    const seeds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    const s = initBracket(seeds, T0);
    expect(roundName(s)).toBe("quarter");
    expect(currentMatch(s)).toMatchObject({ a: "s1", b: "s8" });
    expect(matchProgress(s)).toEqual({ done: 0, total: 7 });
    expect(s.deadline).toBe(T0 + 30_000);
    expect(playOut(seeds).winner).toBe("s1");
  });

  it("5 seeds: top 3 seeds get byes, never a bye-vs-bye", () => {
    const s = initBracket(["s1", "s2", "s3", "s4", "s5"], T0);
    // Only s4 v s5 needs a vote in round one.
    expect(currentMatch(s)).toMatchObject({ a: "s4", b: "s5" });
    expect(s.rounds[0].every((m) => m.a || m.b)).toBe(true);
    expect(matchProgress(s).total).toBe(4);
  });

  it("3 seeds: s1 has a bye, s2 v s3, then the final", () => {
    let s = initBracket(["s1", "s2", "s3"], T0);
    expect(currentMatch(s)).toMatchObject({ a: "s2", b: "s3" });
    s = closeMatch(s, { a: 0, b: 2 }, 0, T0);
    expect(roundName(s)).toBe("final");
    expect(currentMatch(s)).toMatchObject({ a: "s1", b: "s3" });
    s = closeMatch(s, { a: 1, b: 2 }, 0, T0);
    expect(s.winner).toBe("s3");
    expect(s.deadline).toBeNull();
  });

  it("2 seeds: a single final", () => {
    const s = initBracket(["a", "b"], T0);
    expect(roundName(s)).toBe("final");
    expect(closeMatch(s, { a: 0, b: 1 }, 0, T0).winner).toBe("b");
  });

  it("ties use the random draw", () => {
    const s = initBracket(["a", "b"], T0);
    expect(closeMatch(s, { a: 1, b: 1 }, 0.2, T0).winner).toBe("a");
    expect(closeMatch(s, { a: 1, b: 1 }, 0.8, T0).winner).toBe("b");
  });

  it("does not mutate the previous state", () => {
    const s = initBracket(["a", "b", "c", "d"], T0);
    const before = JSON.stringify(s);
    closeMatch(s, { a: 1, b: 0 }, 0, T0);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("rejects too few or too many candidates", () => {
    expect(() => initBracket(["a"], T0)).toThrow();
    expect(() => initBracket(Array.from({ length: 9 }, (_, i) => `m${i}`), T0)).toThrow();
  });
});

describe("tavolo", () => {
  const cands = ["a", "b", "c"];

  it("most dots wins", () => {
    const s = closeTable(initTable(T0), cands, [
      { dots: { a: 2, b: 1 }, veto: null },
      { dots: { b: 3 }, veto: null },
    ], 0);
    expect(s.winner).toBe("b");
    expect(s.scores?.[0]).toEqual({ mediaId: "b", dots: 4, vetoed: false });
  });

  it("a vetoed title cannot win, even with the most dots", () => {
    const s = closeTable(initTable(T0), cands, [
      { dots: { a: 3 }, veto: null },
      { dots: { a: 2, c: 1 }, veto: "a" },
    ], 0);
    expect(s.winner).toBe("c");
  });

  it("if everything is vetoed, vetoes are ignored", () => {
    const s = closeTable(initTable(T0), ["a", "b"], [
      { dots: { a: 3 }, veto: "a" },
      { dots: { a: 3 }, veto: "b" },
    ], 0);
    expect(s.winner).toBe("a");
  });

  it("validates ballots", () => {
    expect(validBallot({ dots: { a: 2, b: 1 }, veto: "c" }, cands)).toBe(true);
    expect(validBallot({ dots: { a: 4 }, veto: null }, cands)).toBe(false);
    expect(validBallot({ dots: { a: 1 }, veto: null }, cands)).toBe(false); // must place all dots
    expect(validBallot({ dots: { z: 3 }, veto: null }, cands)).toBe(false);
    expect(validBallot({ dots: { a: -1, b: 4 }, veto: null }, cands)).toBe(false);
    expect(validBallot({ dots: { a: 3 }, veto: "z" }, cands)).toBe(false);
  });
});
