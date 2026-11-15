import { describe, it, expect } from "vitest";
import { starsFromRating } from "@/ui/components/star-rating-logic";

describe("starsFromRating", () => {
  it("4.5 -> 4 full, 1 half, 0 empty", () => {
    expect(starsFromRating(4.5)).toEqual({ full: 4, half: 1, empty: 0 });
  });
  it("3 -> 3 full, 0 half, 2 empty", () => {
    expect(starsFromRating(3)).toEqual({ full: 3, half: 0, empty: 2 });
  });
  it("null -> all empty", () => {
    expect(starsFromRating(null)).toEqual({ full: 0, half: 0, empty: 5 });
  });
});
