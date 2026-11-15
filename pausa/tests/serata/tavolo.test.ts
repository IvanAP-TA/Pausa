import { describe, it, expect } from "vitest";
import { tallyTavolo } from "@/modules/serata/tavolo";

const cands = ["a", "b", "c"];

describe("tallyTavolo", () => {
  it("counts dots, highest wins", () => {
    const r = tallyTavolo(
      [
        { mediaEntityId: "a", kind: "dot" },
        { mediaEntityId: "b", kind: "dot" },
        { mediaEntityId: "b", kind: "dot" },
      ],
      cands,
    );
    expect(r.scores).toEqual({ a: 1, b: 2, c: 0 });
    expect(r.winnerId).toBe("b");
  });

  it("veto removes a candidate from winning and ignores its dots", () => {
    const r = tallyTavolo(
      [
        { mediaEntityId: "b", kind: "dot" },
        { mediaEntityId: "b", kind: "dot" },
        { mediaEntityId: "b", kind: "veto" },
        { mediaEntityId: "a", kind: "dot" },
      ],
      cands,
    );
    expect(r.vetoed).toContain("b");
    expect(r.winnerId).toBe("a");
  });

  it("stable tie-break by candidate order", () => {
    const r = tallyTavolo(
      [
        { mediaEntityId: "a", kind: "dot" },
        { mediaEntityId: "c", kind: "dot" },
      ],
      cands,
    );
    expect(r.winnerId).toBe("a");
  });
});
