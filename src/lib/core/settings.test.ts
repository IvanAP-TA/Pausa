import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { circle, invite } from "../../db/schema";
import { createCircleWithInvite, redeemInvite } from "./circles";
import type { AnyDb } from "./db-types";
import {
  filterRecipients, getCircleSettings, getDisabledTypes, setCircleProfile, setDisabledTypes, setEmailDigest, setLiveWatching, setMemberPrefs,
} from "./settings";
import { createTestDb, seedUsers } from "./test-db";

let db: AnyDb;
let circleId: string;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob", "Cleo"]);
  circleId = (await createCircleWithInvite(db, { name: "Divano", createdBy: "u-ann" })).id;
  const [inv] = await db.select().from(invite).where(eq(invite.circleId, circleId));
  await redeemInvite(db, "u-bob", inv.code);
  await redeemInvite(db, "u-cleo", inv.code);
});

describe("Cerchia settings", () => {
  it("starts with everything on", async () => {
    expect(await getCircleSettings(db, circleId, "u-bob")).toEqual({ liveWatching: true, description: null, cover: null, muted: false, hideWatching: false, role: "member" });
  });

  it("only an admin switches live watching and edits the profile", async () => {
    expect(await setLiveWatching(db, { circleId, actorId: "u-bob", enabled: false })).toEqual({ error: "forbidden" });
    expect(await setLiveWatching(db, { circleId, actorId: "u-ann", enabled: false })).toEqual({ ok: true });
    expect((await getCircleSettings(db, circleId, "u-bob"))!.liveWatching).toBe(false);
    expect(await setCircleProfile(db, { circleId, actorId: "u-bob", description: "x", cover: "moon" })).toEqual({ error: "forbidden" });
    expect(await setCircleProfile(db, { circleId, actorId: "u-ann", description: "  Il divano del giovedì  ", cover: "sofa" })).toEqual({ ok: true });
    expect(await setCircleProfile(db, { circleId, actorId: "u-ann", description: null, cover: "not-a-cover" })).toEqual({ error: "invalid" });
    expect(await getCircleSettings(db, circleId, "u-ann")).toMatchObject({ description: "Il divano del giovedì", cover: "sofa" });
    await setCircleProfile(db, { circleId, actorId: "u-ann", description: "a".repeat(500), cover: null });
    expect((await getCircleSettings(db, circleId, "u-ann"))!.description).toHaveLength(280);
  });

  it("a person's own switches belong to them and to a Cerchia they are in", async () => {
    expect(await setMemberPrefs(db, { circleId, userId: "u-bob", muted: true, hideWatching: true })).toEqual({ ok: true });
    expect(await getCircleSettings(db, circleId, "u-bob")).toMatchObject({ muted: true, hideWatching: true });
    expect(await getCircleSettings(db, circleId, "u-cleo")).toMatchObject({ muted: false, hideWatching: false });
    await db.delete(circle).where(eq(circle.id, "none"));
    expect(await setMemberPrefs(db, { circleId: "nope", userId: "u-bob", muted: true, hideWatching: false })).toEqual({ error: "not_member" });
    expect(await getCircleSettings(db, "nope", "u-bob")).toBeNull();
  });
});

describe("filterRecipients", () => {
  const all = ["u-ann", "u-bob", "u-cleo"];

  it("keeps everyone by default", async () => {
    expect(await filterRecipients(db, all, { type: "log", circleId })).toEqual(all);
    expect(await filterRecipients(db, [], { type: "log", circleId })).toEqual([]);
  });

  it("drops people who muted the Cerchia, for every kind of notice", async () => {
    await setMemberPrefs(db, { circleId, userId: "u-bob", muted: true, hideWatching: false });
    expect(await filterRecipients(db, all, { type: "comment", circleId })).toEqual(["u-ann", "u-cleo"]);
  });

  it("drops people who switched that kind of notice off, only that kind", async () => {
    await setDisabledTypes(db, "u-cleo", ["reaction", "now_watching"]);
    expect(await filterRecipients(db, all, { type: "reaction", circleId })).toEqual(["u-ann", "u-bob"]);
    expect(await filterRecipients(db, all, { type: "log", circleId })).toEqual(all);
    expect(await filterRecipients(db, all, { type: "reaction" })).toEqual(["u-ann", "u-bob"]); // no Cerchia: the type switch still applies
  });

  it("live watching: off for the whole Cerchia, or hidden by one person", async () => {
    await setMemberPrefs(db, { circleId, userId: "u-bob", muted: false, hideWatching: true });
    expect(await filterRecipients(db, all, { type: "now_watching", circleId })).toEqual(["u-ann", "u-cleo"]);
    expect(await filterRecipients(db, all, { type: "log", circleId })).toEqual(all); // hiding live watching changes nothing else
    await setLiveWatching(db, { circleId, actorId: "u-ann", enabled: false });
    expect(await filterRecipients(db, all, { type: "now_watching", circleId })).toEqual([]);
    expect(await filterRecipients(db, all, { type: "log", circleId })).toEqual(all);
  });
});

describe("type switches and the digest", () => {
  it("stores the switched-off set and replaces it wholesale; unknown names are ignored", async () => {
    await setDisabledTypes(db, "u-ann", ["log", "comment", "log", "bogus" as never]);
    expect([...(await getDisabledTypes(db, "u-ann"))].sort()).toEqual(["comment", "log"]);
    await setDisabledTypes(db, "u-ann", []);
    expect((await getDisabledTypes(db, "u-ann")).size).toBe(0);
  });

  it("the email digest is opt-in", async () => {
    await setEmailDigest(db, "u-ann", true);
    const { user } = await import("../../db/schema");
    expect((await db.select({ d: user.emailDigest }).from(user).where(eq(user.id, "u-ann")))[0].d).toBe(true);
    expect((await db.select({ d: user.emailDigest }).from(user).where(eq(user.id, "u-bob")))[0].d).toBe(false);
  });
});
