import { describe, it, expect } from "vitest";
import { isValidRating } from "@/modules/diary/rating";

describe("isValidRating", () => {
  it("accepts null (no rating)", () => expect(isValidRating(null)).toBe(true));
  it("accepts 0.5 steps 0.5..5", () => {
    for (const r of [0.5, 1, 2.5, 5]) expect(isValidRating(r)).toBe(true);
  });
  it("rejects out of range / wrong step / zero", () => {
    for (const r of [0, 0.3, 5.5, 3.1, -1]) expect(isValidRating(r)).toBe(false);
  });
});
