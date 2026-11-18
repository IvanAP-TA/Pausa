import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { circleMember, invite, list, log, logShare } from "../../db/schema";
import { createCircleWithInvite, redeemInvite } from "./circles";
import type { AnyDb } from "./db-types";
import { importList, importRows } from "./import";
import { createImportBatch, getImportBatch, listImportBatches, removeImportFromCircle } from "./import-batches";
import type { ImportRow } from "./import-parsers";
import { shareLog } from "./sharing";
import { createTestDb, seedUsers } from "./test-db";
import { visibleIn } from "./visibility";

let db: AnyDb;
let divano: string;
let cinema: string;

const row = (title: string, o: Partial<ImportRow> = {}): ImportRow =>
  ({ source: "imdb", kind: "movie", title, year: 2020, rating: 8, watchedOn: "2025-01-01", rewatch: false, review: null, ...o });
const opts = { includeReviews: true, includeUndated: false, today: "2026-12-01" };

/** The titles a Cerchia shows from one person: the same join and rule the feed uses. */
const shownIn = async (circleId: string) =>
  (await db.select({ id: log.id }).from(log)
    .innerJoin(circleMember, and(eq(circleMember.userId, log.userId), eq(circleMember.circleId, circleId)))
    .where(visibleIn(circleId))).length;

const batchFor = async (circleId: string | null, userId = "u-ann") => {
  const b = await createImportBatch(db, { userId, source: "imdb", circleId });
  if ("error" in b) throw new Error(b.error);
  return b.id;
};

beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo"]);
  divano = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  cinema = (await createCircleWithInvite(db, { name: "Cinema", createdBy: "u-ann" })).id;
  const [inv] = await db.select().from(invite).where(eq(invite.circleId, divano));
  await redeemInvite(db, "u-bob", inv.code);
});

describe("import destination", () => {
  it("the personal space is the default: nothing shows in any Cerchia", async () => {
    const batchId = await batchFor(null);
    const res = await importRows(db, "u-ann", [row("One"), row("Two")], { ...opts, batchId });
    expect(res).toMatchObject({ imported: 2, addedToCircle: 0 });
    expect(await shownIn(divano)).toBe(0);
    expect((await db.select().from(log)).every((l) => l.scope === "private" && l.importBatchId === batchId)).toBe(true);
  });

  it("a Cerchia as destination shows the import there and nowhere else, dated like the viewings", async () => {
    const batchId = await batchFor(divano);
    const res = await importRows(db, "u-ann", [row("One", { watchedOn: "2021-03-04" }), row("Two")], { ...opts, batchId, circleId: divano });
    expect(res).toMatchObject({ imported: 2, addedToCircle: 2 });
    expect(await shownIn(divano)).toBe(2);
    expect(await shownIn(cinema)).toBe(0);
    const shares = await db.select().from(logShare);
    expect(shares.every((x) => x.importBatchId === batchId && x.circleId === divano)).toBe(true);
    expect(shares.map((x) => x.createdAt.toISOString().slice(0, 10)).sort()).toEqual(["2021-03-04", "2025-01-01"]);
  });

  it("viewings that were already in the personal space join the Cerchia too, once", async () => {
    await importRows(db, "u-ann", [row("One")], opts); // an older, untracked import
    const batchId = await batchFor(divano);
    const res = await importRows(db, "u-ann", [row("One"), row("One"), row("Two")], { ...opts, batchId, circleId: divano });
    expect(res).toMatchObject({ imported: 1, alreadyHad: 2, addedToCircle: 2 });
    expect(await shownIn(divano)).toBe(2);
    expect(await importRows(db, "u-ann", [row("One"), row("Two")], { ...opts, batchId, circleId: divano })).toMatchObject({ imported: 0, addedToCircle: 0 });
  });

  it("refuses a Cerchia the person is not in", async () => {
    expect(await createImportBatch(db, { userId: "u-cleo", source: "trakt", circleId: divano })).toEqual({ error: "not_member" });
  });

  it("a run is only its owner's, and loses its destination when they leave the Cerchia", async () => {
    const batchId = await batchFor(divano, "u-bob");
    expect(await getImportBatch(db, "u-ann", batchId)).toBeNull();
    expect(await getImportBatch(db, "u-bob", batchId)).toMatchObject({ circleId: divano, left: false });
    await db.delete(circleMember).where(and(eq(circleMember.circleId, divano), eq(circleMember.userId, "u-bob")));
    expect(await getImportBatch(db, "u-bob", batchId)).toMatchObject({ circleId: null, left: true });
  });
});

describe("taking an import out of a Cerchia", () => {
  it("drops what the run shared and keeps everything in the personal space", async () => {
    const batchId = await batchFor(divano);
    await importRows(db, "u-ann", [row("One"), row("Two"), row("Three")], { ...opts, batchId, circleId: divano });
    expect(await removeImportFromCircle(db, { userId: "u-ann", batchId })).toEqual({ removed: 3, lists: 0 });
    expect(await shownIn(divano)).toBe(0);
    expect((await db.select().from(log)).length).toBe(3);
    expect(await removeImportFromCircle(db, { userId: "u-ann", batchId })).toEqual({ removed: 0, lists: 0 });
  });

  it("leaves alone what was shared by hand, logged by hand, or brought in by another run", async () => {
    await db.insert(log).values({ id: "hand", userId: "u-ann", mediaId: (await seedMedia()), watchedOn: "2026-02-02" }); // open to every Cerchia
    const first = await batchFor(divano);
    await importRows(db, "u-ann", [row("One")], { ...opts, batchId: first, circleId: divano });
    const second = await batchFor(null);
    await importRows(db, "u-ann", [row("Two")], { ...opts, batchId: second });
    const [two] = await db.select().from(log).where(eq(log.importBatchId, second));
    await shareLog(db, { logId: two.id, circleId: divano, actorId: "u-ann" });
    expect(await shownIn(divano)).toBe(3);

    expect(await removeImportFromCircle(db, { userId: "u-ann", batchId: first })).toMatchObject({ removed: 1 });
    expect(await shownIn(divano)).toBe(2); // the hand-written log and the one shared by hand
  });

  it("is refused to anyone but the person who imported", async () => {
    const batchId = await batchFor(divano);
    await importRows(db, "u-ann", [row("One")], { ...opts, batchId, circleId: divano });
    expect(await removeImportFromCircle(db, { userId: "u-bob", batchId })).toEqual({ error: "not_found" });
    expect(await shownIn(divano)).toBe(1);
  });

  it("turns the group lists the run created into personal lists", async () => {
    const batchId = await batchFor(divano);
    await importList(db, "u-ann", { name: "Da vedere", description: null, kind: "list", circleId: divano, rows: [row("One"), row("Two")], offset: 0, batchId });
    await db.insert(list).values({ id: "by-hand", circleId: divano, ownerId: "u-ann", name: "A mano" });
    expect(await removeImportFromCircle(db, { userId: "u-ann", batchId })).toEqual({ removed: 0, lists: 1 });
    const lists = await db.select().from(list);
    expect(lists.find((l) => l.name === "Da vedere")?.circleId).toBeNull();
    expect(lists.find((l) => l.id === "by-hand")?.circleId).toBe(divano);
  });
});

describe("the list of imports", () => {
  it("says where each run went and what is still there, newest first, without empty runs", async () => {
    await batchFor(null); // opened, nothing imported
    const a = await batchFor(divano);
    await importRows(db, "u-ann", [row("One"), row("Two")], { ...opts, batchId: a, circleId: divano });
    const b = await batchFor(null);
    await importRows(db, "u-ann", [row("Three")], { ...opts, batchId: b });

    const mine = await listImportBatches(db, "u-ann");
    expect(mine.map((x) => x.id).sort()).toEqual([a, b].sort());
    expect(mine.find((x) => x.id === a)).toMatchObject({ circle: { id: divano, name: "Divano" }, logs: 2, inCircle: 2, listsInCircle: 0 });
    expect(mine.find((x) => x.id === b)).toMatchObject({ circle: null, logs: 1, inCircle: 0 });
    expect(await listImportBatches(db, "u-bob")).toEqual([]);

    await removeImportFromCircle(db, { userId: "u-ann", batchId: a });
    expect((await listImportBatches(db, "u-ann")).find((x) => x.id === a)).toMatchObject({ logs: 2, inCircle: 0 });
  });
});

async function seedMedia() {
  const { mediaEntity } = await import("../../db/schema");
  await db.insert(mediaEntity).values({ id: "m-hand", kind: "movie", originalTitle: "By hand" });
  return "m-hand";
}
