import { describe, it, expect } from "vitest";
import { mergeFeed } from "@/modules/feed";

describe("mergeFeed", () => {
  it("merges and sorts by createdAt desc", () => {
    const items = mergeFeed(
      [{ id: "l1", createdAt: new Date(100) } as any],
      [{ id: "c1", createdAt: new Date(300) } as any],
      [{ id: "r1", createdAt: new Date(200) } as any],
    );
    expect(items.map((i) => i.id)).toEqual(["c1", "r1", "l1"]);
    expect(items[0].kind).toBe("comment");
  });
});
