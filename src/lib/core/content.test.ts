import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, circleMember, comment, invite, list, listItem, log, logWatchedWith, mediaEntity, reaction, user } from "../../db/schema";
import { deleteAccount, exportAccountData } from "./account";
import { createCircleWithInvite, redeemInvite } from "./circles";
import { deleteComment, deleteList, deleteLog, moveListItem, removeListItem, renameCircle, updateComment, updateLog } from "./content";
import type { AnyDb } from "./db-types";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
let circleId: string;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo"]);
  circleId = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  const [inv] = await db.select().from(invite).where(eq(invite.circleId, circleId));
  await redeemInvite(db, "u-bob", inv.code);
  await db.insert(mediaEntity).values([
    { id: "m1", kind: "movie", originalTitle: "Alpha" }, { id: "m2", kind: "movie", originalTitle: "Beta" }, { id: "m3", kind: "movie", originalTitle: "Gamma" },
  ]);
});

const base = { watchedOn: "2026-01-01", rating: 8, review: "ok", platform: null, season: null, containsSpoilers: false };

describe("logs and comments", () => {
  beforeEach(async () => {
    await db.insert(log).values({ id: "l1", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-01" });
    await db.insert(comment).values([{ id: "c1", logId: "l1", userId: "u-bob", body: "hey" }, { id: "c2", logId: "l1", userId: "u-ann", body: "mine" }]);
  });

  it("only the author edits a log, and 'visto con' keeps members only", async () => {
    expect(await updateLog(db, { ...base, logId: "l1", actorId: "u-bob", circleId, watchedWith: [] })).toEqual({ error: "forbidden" });
    expect(await updateLog(db, { ...base, logId: "nope", actorId: "u-ann", circleId, watchedWith: [] })).toEqual({ error: "not_found" });
    const res = await updateLog(db, { ...base, logId: "l1", actorId: "u-ann", circleId, rating: 3, watchedWith: ["u-bob", "u-cleo", "u-ann"] });
    expect(res).toEqual({ ok: true });
    const [row] = await db.select().from(log).where(eq(log.id, "l1"));
    expect(row.rating).toBe(3);
    expect((await db.select().from(logWatchedWith)).map((w) => w.userId)).toEqual(["u-bob"]); // Cleo is not a member, Ann is the author
  });

  it("deleting a log takes comments and reactions with it; others cannot", async () => {
    await db.insert(reaction).values({ logId: "l1", userId: "u-bob", emoji: "🔥" });
    expect(await deleteLog(db, { logId: "l1", actorId: "u-bob" })).toEqual({ error: "forbidden" });
    expect(await deleteLog(db, { logId: "l1", actorId: "u-ann" })).toEqual({ ok: true });
    expect(await db.select().from(comment)).toHaveLength(0);
    expect(await db.select().from(reaction)).toHaveLength(0);
  });

  it("comments: the author edits; the author or the thread owner deletes", async () => {
    expect(await updateComment(db, { commentId: "c1", actorId: "u-ann", body: "x", isSpoiler: false })).toEqual({ error: "forbidden" });
    expect(await updateComment(db, { commentId: "c1", actorId: "u-bob", body: "edited", isSpoiler: true })).toEqual({ ok: true, logId: "l1" });
    expect((await db.select().from(comment).where(eq(comment.id, "c1")))[0]).toMatchObject({ body: "edited", isSpoiler: true });
    expect(await deleteComment(db, { commentId: "c2", actorId: "u-bob" })).toEqual({ error: "forbidden" });
    expect(await deleteComment(db, { commentId: "c1", actorId: "u-ann" })).toEqual({ ok: true, logId: "l1" }); // Ann owns the log
    expect(await deleteComment(db, { commentId: "c2", actorId: "u-ann" })).toEqual({ ok: true, logId: "l1" });
  });
});

describe("Cerchia profile", () => {
  it("only admins rename", async () => {
    expect(await renameCircle(db, { circleId, actorId: "u-bob", name: "Hack" })).toEqual({ error: "forbidden" });
    expect(await renameCircle(db, { circleId, actorId: "u-cleo", name: "Hack" })).toEqual({ error: "forbidden" });
    expect(await renameCircle(db, { circleId, actorId: "u-ann", name: "Salotto" })).toEqual({ ok: true });
    expect((await db.select().from(circle).where(eq(circle.id, circleId)))[0].name).toBe("Salotto");
  });
});

describe("lists", () => {
  beforeEach(async () => {
    await db.insert(list).values({ id: "g", circleId, ownerId: "u-ann", kind: "ranking", name: "Top" });
    await db.insert(listItem).values([
      { listId: "g", mediaId: "m1", position: 0, addedBy: "u-ann" }, { listId: "g", mediaId: "m2", position: 1, addedBy: "u-bob" }, { listId: "g", mediaId: "m3", position: 2, addedBy: "u-ann" },
    ]);
  });
  const order = async () => (await db.select().from(listItem).where(eq(listItem.listId, "g"))).sort((a, b) => a.position - b.position).map((i) => i.mediaId);

  it("moves up and down, stopping at the edges", async () => {
    await moveListItem(db, { listId: "g", mediaId: "m3", actorId: "u-bob", direction: "up" });
    expect(await order()).toEqual(["m1", "m3", "m2"]);
    await moveListItem(db, { listId: "g", mediaId: "m1", actorId: "u-ann", direction: "up" });
    expect(await order()).toEqual(["m1", "m3", "m2"]);
    await moveListItem(db, { listId: "g", mediaId: "m2", actorId: "u-ann", direction: "down" });
    expect(await order()).toEqual(["m1", "m3", "m2"]);
  });

  it("heals duplicated positions on move and compacts on remove", async () => {
    await db.update(listItem).set({ position: 0 });
    await moveListItem(db, { listId: "g", mediaId: "m2", actorId: "u-ann", direction: "down" });
    expect((await db.select().from(listItem)).map((i) => i.position).sort()).toEqual([0, 1, 2]);
    await removeListItem(db, { listId: "g", mediaId: "m1", actorId: "u-bob" });
    expect((await db.select().from(listItem)).map((i) => i.position).sort()).toEqual([0, 1]);
  });

  it("outsiders cannot touch a group list; personal lists belong to their owner", async () => {
    expect(await removeListItem(db, { listId: "g", mediaId: "m1", actorId: "u-cleo" })).toEqual({ error: "forbidden" });
    await db.insert(list).values({ id: "p", circleId: null, ownerId: "u-ann", name: "Mine" });
    expect(await moveListItem(db, { listId: "p", mediaId: "m1", actorId: "u-bob", direction: "up" })).toEqual({ error: "forbidden" });
  });

  it("deleting a group list: its owner or a Cerchia admin, not a plain member", async () => {
    await db.insert(list).values({ id: "g2", circleId, ownerId: "u-bob", name: "Bob list" });
    expect(await deleteList(db, { listId: "g2", actorId: "u-cleo" })).toEqual({ error: "forbidden" });
    expect(await deleteList(db, { listId: "g2", actorId: "u-ann" })).toEqual({ ok: true });
    expect(await deleteList(db, { listId: "g", actorId: "u-bob" })).toEqual({ error: "forbidden" });
  });
});

describe("account", () => {
  it("exports the person's own data", async () => {
    await db.insert(log).values({ id: "l1", userId: "u-bob", mediaId: "m1", watchedOn: "2026-02-02", rating: 9, review: "wow" });
    const data = await exportAccountData(db, "u-bob");
    expect(data.profile.email).toBe("bob@test.dev");
    expect(data.logs).toMatchObject([{ title: "Alpha", rating: 9, review: "wow" }]);
    expect(data.circles).toMatchObject([{ name: "Divano", role: "member" }]);
  });

  it("deleting the creator hands the Cerchia to the next member and keeps its lists", async () => {
    await db.insert(list).values({ id: "g", circleId, ownerId: "u-ann", name: "Top" });
    await db.insert(list).values({ id: "p", circleId: null, ownerId: "u-ann", name: "Private" });
    await db.insert(log).values({ id: "l1", userId: "u-ann", mediaId: "m1", watchedOn: "2026-01-01" });
    await deleteAccount(db, "u-ann");
    expect(await db.select().from(user).where(eq(user.id, "u-ann"))).toHaveLength(0);
    const [c] = await db.select().from(circle).where(eq(circle.id, circleId));
    expect(c.createdBy).toBe("u-bob");
    expect((await db.select().from(circleMember).where(eq(circleMember.userId, "u-bob")))[0].role).toBe("admin");
    expect((await db.select().from(list)).map((l) => l.id)).toEqual(["g"]);
    expect((await db.select().from(list).where(eq(list.id, "g")))[0].ownerId).toBe("u-bob");
    expect(await db.select().from(log)).toHaveLength(0);
    expect((await db.select().from(invite))[0].createdBy).toBe("u-bob");
  });

  it("deleting the only member removes the Cerchia; a plain member just leaves", async () => {
    await deleteAccount(db, "u-bob");
    expect(await db.select().from(circle)).toHaveLength(1);
    await deleteAccount(db, "u-ann");
    expect(await db.select().from(circle)).toHaveLength(0);
    expect(await db.select().from(invite)).toHaveLength(0);
  });
});
