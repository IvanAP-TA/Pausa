import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { createCircle, createInvite, joinByCode, listCirclesForUser } from "@/modules/circles";
import { createLog, addComment } from "@/modules/diary";
import { getFeed } from "@/modules/feed";
import { createList, addItem, listLists } from "@/modules/lists";

let db: any;

beforeAll(() => {
  const sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  const now = new Date();
  db.insert(schema.users).values([
    { id: "u1", email: "a@b.com", name: "Ann", createdAt: now },
    { id: "u2", email: "c@d.com", name: "Bob", createdAt: now },
  ]).run();
  db.insert(schema.mediaEntities).values({
    id: "m1", tmdbId: 27205, type: "movie", title: "Inception", year: 2010, cachedAt: now,
  }).run();
});

describe("end-to-end diary flow", () => {
  it("create circle -> invite -> join -> log -> comment -> feed", async () => {
    const circle = await createCircle(db, "u1", "Movie Night");
    const invite = await createInvite(db, circle.id, "u1");
    const joined = await joinByCode(db, "u2", invite.code, 0);
    expect("circleId" in joined).toBe(true);

    expect((await listCirclesForUser(db, "u2")).length).toBe(1);

    const log = await createLog(db, {
      circleId: circle.id, userId: "u1", mediaEntityId: "m1", rating: 4.5, watchedWith: ["u2"],
    });
    await addComment(db, { logId: log.id, userId: "u2", body: "loved it", isSpoiler: false });

    const feed = await getFeed(db, circle.id);
    expect(feed.length).toBeGreaterThanOrEqual(2);
    expect(feed.some((f) => f.kind === "log")).toBe(true);
    expect(feed.some((f) => f.kind === "comment")).toBe(true);
  });

  it("creates a circle list with an item", async () => {
    const circle = await createCircle(db, "u1", "Watchlist crew");
    const list = await createList(db, { scope: "circle", circleId: circle.id, name: "Da vedere" });
    await addItem(db, { listId: list.id, mediaEntityId: "m1", addedBy: "u1" });
    const all = await listLists(db, { scope: "circle", circleId: circle.id });
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("Da vedere");
  });
});
