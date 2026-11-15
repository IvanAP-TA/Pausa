import { describe, it, expect } from "vitest";
import { createLog } from "@/modules/diary";

const NAME = Symbol.for("drizzle:Name");

function stubDb() {
  const store: Record<string, any[]> = { log_entries: [], log_watched_with: [] };
  return {
    store,
    insert: (table: any) => ({
      values: async (v: any) => {
        const name: string = table[NAME];
        (store[name] ??= []).push(v);
        return v;
      },
    }),
  } as any;
}

describe("createLog", () => {
  it("rejects invalid rating", async () => {
    await expect(
      createLog(stubDb(), { circleId: "c", userId: "u", mediaEntityId: "m", rating: 3.1 }),
    ).rejects.toThrow(/rating/i);
  });

  it("inserts log + watched-with rows", async () => {
    const db = stubDb();
    const log = await createLog(db, {
      circleId: "c", userId: "u", mediaEntityId: "m", rating: 4, watchedWith: ["u2", "u3"],
    });
    expect(log.id).toBeTruthy();
    expect(db.store.log_entries.length).toBe(1);
    expect(db.store.log_watched_with.length).toBe(2);
  });
});
