import type { RoomView } from "@pausa/api-types";
import { describe, expect, it } from "vitest";
import { backoffMs, ballotProblem, cleanBallot, clock, codeFrom, dotsLeft, elapsedShare, matchNumber, matchPair, newer, secondsLeft, socketUrl, withBallot, withPick } from "@/features/serata/room-logic";

const cand = (id: string, seed: number) => ({ id, kind: "movie", title: `Film ${seed}`, year: null, posterPath: null });
const view = (over: Partial<RoomView> = {}): RoomView => ({
  code: "ABC234", mode: "bracket", status: "voting", version: 5, circleId: "c1", isHost: false, hostId: "x", joined: true,
  candidates: [cand("a", 1), cand("b", 2), cand("c", 3)],
  participants: [{ id: "me", name: "Io", image: null, isGuest: false, voted: false }, { id: "x", name: "Xe", image: null, isGuest: true, voted: true }],
  bracket: { roundName: "semi", done: 0, total: 2, a: "b", b: "c", myPick: null, deadline: 10_000 },
  table: null, result: null, serverNow: 4_000, ...over,
});

describe("clock and countdown (the server owns it)", () => {
  it("counts the seconds left against the server clock, rounding up, never below zero", () => {
    expect(secondsLeft(10_000, 0, 4_000)).toBe(6);
    expect(secondsLeft(10_000, 0, 4_001)).toBe(6);
    expect(secondsLeft(10_000, 0, 9_999)).toBe(1);
    expect(secondsLeft(10_000, 0, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 0, 99_000)).toBe(0);
  });
  it("uses the offset between the server and the device clock", () => {
    // the device is 5 s ahead of the server: serverNow 4_000 was read at device time 9_000
    const offset = 4_000 - 9_000;
    expect(secondsLeft(10_000, offset, 9_000)).toBe(6);
    expect(secondsLeft(10_000, offset, 12_000)).toBe(3);
  });
  it("has no countdown without a deadline", () => expect(secondsLeft(null, 0)).toBeNull());
  it("formats m:ss and the bar's share", () => {
    expect(clock(65)).toBe("1:05");
    expect(clock(7)).toBe("0:07");
    expect(elapsedShare(10_000, 0, 6_000, 4_000)).toBe(0);
    expect(elapsedShare(10_000, 0, 6_000, 7_000)).toBeCloseTo(0.5);
    expect(elapsedShare(10_000, 0, 6_000, 20_000)).toBe(1);
  });
});

describe("views", () => {
  it("a late, older view never replaces a newer one", () => {
    const v5 = view({ version: 5 });
    expect(newer(v5, view({ version: 4, status: "lobby" }))).toBe(v5);
    expect(newer(v5, view({ version: 5 })).version).toBe(5);
    expect(newer(v5, view({ version: 6 })).version).toBe(6);
    expect(newer(null, v5)).toBe(v5);
  });
  it("numbers the match being voted and never past the total", () => {
    expect(matchNumber({ done: 0, total: 7 })).toEqual({ n: 1, total: 7 });
    expect(matchNumber({ done: 1, total: 2 })).toEqual({ n: 2, total: 2 });
    expect(matchNumber({ done: 2, total: 2 })).toEqual({ n: 2, total: 2 });
  });
  it("resolves the two titles of the match", () => {
    expect(matchPair(view())?.a.id).toBe("b");
    expect(matchPair(view({ bracket: null }))).toBeNull();
    expect(matchPair(view({ bracket: { roundName: "final", done: 0, total: 1, a: "zz", b: "c", myPick: null, deadline: null } }))).toBeNull();
  });
  it("an optimistic pick marks my choice and that I voted, and leaves the original untouched (rollback = keep it)", () => {
    const before = view();
    const after = withPick(before, "me", "c");
    expect(after.bracket?.myPick).toBe("c");
    expect(after.participants.find((p) => p.id === "me")?.voted).toBe(true);
    expect(before.bracket?.myPick).toBeNull();
    expect(before.participants.find((p) => p.id === "me")?.voted).toBe(false);
  });
  it("an optimistic ballot does the same on the table", () => {
    const t = view({ mode: "table", bracket: null, table: { deadline: 1, dots: 3, myBallot: null } });
    const after = withBallot(t, "me", { dots: { a: 3 }, veto: null });
    expect(after.table?.myBallot).toEqual({ dots: { a: 3 }, veto: null });
    expect(after.participants.find((p) => p.id === "me")?.voted).toBe(true);
    expect(withPick(t, "me", "a")).toBe(t); // not a bracket: nothing to pick
  });
});

describe("the table ballot", () => {
  const ids = ["a", "b", "c"];
  it("accepts exactly three dots, spread anyhow, with an optional veto on a candidate", () => {
    expect(ballotProblem({ dots: { a: 3 }, veto: null }, ids, 3)).toBeNull();
    expect(ballotProblem({ dots: { a: 1, b: 1, c: 1 }, veto: "a" }, ids, 3)).toBeNull(); // a veto may sit on a title that got dots
  });
  it("refuses too few, too many, negative, fractional, unknown titles and unknown vetoes", () => {
    expect(ballotProblem({ dots: { a: 2 }, veto: null }, ids, 3)).toBe("dots");
    expect(ballotProblem({ dots: { a: 4 }, veto: null }, ids, 3)).toBe("dots");
    expect(ballotProblem({ dots: { a: 4, b: -1 }, veto: null }, ids, 3)).toBe("dots");
    expect(ballotProblem({ dots: { a: 1.5, b: 1.5 }, veto: null }, ids, 3)).toBe("dots");
    expect(ballotProblem({ dots: { zz: 3 }, veto: null }, ids, 3)).toBe("unknown");
    expect(ballotProblem({ dots: { a: 3 }, veto: "zz" }, ids, 3)).toBe("veto");
  });
  it("counts what is left and sends only the dots that were placed", () => {
    expect(dotsLeft({ a: 1, b: 0 }, 3)).toBe(2);
    expect(dotsLeft({}, 3)).toBe(3);
    expect(cleanBallot({ a: 2, b: 0, c: 1 }, "b")).toEqual({ dots: { a: 2, c: 1 }, veto: "b" });
  });
});

describe("connection helpers", () => {
  it("builds the WebSocket address from the API origin, or the page's own", () => {
    expect(socketUrl("", "https://pausa.gnagno.org", "AB12CD")).toBe("wss://pausa.gnagno.org/api/serate/AB12CD/ws");
    expect(socketUrl("http://localhost:8799", null, "AB12CD")).toBe("ws://localhost:8799/api/serate/AB12CD/ws");
  });
  it("backs off 1, 2, 4, 8 s and stays at 8", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
  it("reads a code out of a typed code or a whole link", () => {
    expect(codeFrom(" abc234 ")).toBe("ABC234");
    expect(codeFrom("https://pausa.gnagno.org/it/s/abc234?x=1")).toBe("ABC234");
  });
});
