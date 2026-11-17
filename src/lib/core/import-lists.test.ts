import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { list, listItem } from "../../db/schema";
import { importList } from "./import";
import { letterboxdList, letterboxdWatchlist } from "./import-parsers";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
beforeEach(async () => { db = await createTestDb(); await seedUsers(db, ["Ann"]); });

const LIST_CSV = `Letterboxd list export v7
Date,Name,Tags,URL,Description
2026-03-01,"Slow ""cinema"" nights",quiet,https://boxd.it/abc12,"For rainy days, mostly."

Position,Name,Year,URL,Description
1,Drive My Car,2021,https://boxd.it/sv94,
2,"Evil Does Not Exist",2023,https://boxd.it/HJrc,Great.
3,Perfect Days,2023,https://letterboxd.com/film/perfect-days/,
`;

describe("Letterboxd list files", () => {
  it("reads a list export: name, description, films in order", () => {
    const l = letterboxdList(LIST_CSV)!;
    expect(l).toMatchObject({ name: 'Slow "cinema" nights', description: "For rainy days, mostly.", kind: "list" });
    expect(l.rows.map((r) => r.title)).toEqual(["Drive My Car", "Evil Does Not Exist", "Perfect Days"]);
    expect(l.rows[2].letterboxdUri).toBeNull(); // only boxd.it links are kept
    expect(l.rows[0]).toMatchObject({ year: 2021, watchedOn: null, rating: null, letterboxdUri: "https://boxd.it/sv94" });
  });

  it("reads the watchlist", () => {
    const w = letterboxdWatchlist("Date,Name,Year,Letterboxd URI\n2026-08-12,The Wild Robot,2024,https://boxd.it/IWFy\n")!;
    expect(w).toMatchObject({ name: "Watchlist", kind: "watchlist" });
    expect(w.rows).toHaveLength(1);
  });

  it("ignores files that are not lists", () => {
    expect(letterboxdList("Date,Name,Year,Letterboxd URI\n")).toBeNull();
    expect(letterboxdWatchlist("Date,Name,Year,Letterboxd URI\n")).toBeNull();
  });
});

describe("importList", () => {
  const rows = () => letterboxdList(LIST_CSV)!.rows;
  const base = { name: "Slow nights", description: null, kind: "list" as const, circleId: null, offset: 0 };

  it("creates a personal list with the films in order, and is idempotent", async () => {
    const r = await importList(db, "u-ann", { ...base, rows: rows() });
    expect(r).toMatchObject({ added: 3, alreadyHad: 0, newTitles: 3 });
    const items = await db.select().from(listItem).where(eq(listItem.listId, r.listId));
    expect(items.map((i) => i.position).sort()).toEqual([0, 1, 2]);
    const again = await importList(db, "u-ann", { ...base, rows: rows() });
    expect(again).toMatchObject({ added: 0, alreadyHad: 3, newTitles: 0, listId: r.listId });
    expect(await db.select().from(list)).toHaveLength(1);
  });

  it("fills the same list across chunks, continuing the positions", async () => {
    const all = rows();
    const a = await importList(db, "u-ann", { ...base, rows: all.slice(0, 2), offset: 0 });
    const b = await importList(db, "u-ann", { ...base, rows: all.slice(2), offset: 2 });
    expect(b.listId).toBe(a.listId);
    const items = await db.select().from(listItem).where(eq(listItem.listId, a.listId));
    expect(items).toHaveLength(3);
    expect(Math.max(...items.map((i) => i.position))).toBe(2);
  });
});
