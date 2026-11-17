import { beforeEach, describe, expect, it } from "vitest";
import type { AnyDb } from "./db-types";
import { pushMessage, pushUrl, removeSubscription, saveSubscription, subscriptionsFor } from "./push";
import { createTestDb, seedUsers } from "./test-db";

describe("pushMessage", () => {
  it("speaks the subscriber's language and titles with the Cerchia", () => {
    expect(pushMessage("log", "it", { name: "Giulia", title: "Chernobyl", circle: "Divano Club" })).toEqual({ title: "Divano Club", body: "Giulia ha visto Chernobyl" });
    expect(pushMessage("log", "en", { name: "Giulia", title: "Chernobyl", circle: "Divano Club" }).body).toBe("Giulia watched Chernobyl");
    expect(pushMessage("now_watching", "es", { name: "Sofi", title: "Breaking Bad" }).body).toBe("Sofi está viendo Breaking Bad");
  });
  it("falls back to Pausa as the title, and covers every kind", () => {
    expect(pushMessage("circle_join", "it", { name: "Luca", circle: "Divano Club" }).body).toContain("Divano Club");
    for (const k of ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join"] as const) {
      const m = pushMessage(k, "en", { name: "A", title: "T", circle: "C" });
      expect(m.body.length).toBeGreaterThan(3);
      expect(m.body).not.toContain("{");
    }
    expect(pushMessage("serata_invite", "en", { name: "A" }).title).toBe("Pausa");
  });
});

describe("pushUrl", () => {
  it("points at the log, then the Cerchia, then the app entry", () => {
    expect(pushUrl("it", { circleId: "c1", logId: "l1" })).toBe("/it/c/c1/l/l1");
    expect(pushUrl("en", { circleId: "c1" })).toBe("/en/c/c1");
    expect(pushUrl("es", {})).toBe("/es");
    expect(pushUrl("it", { circleId: "c1", serataCode: "ABC123" })).toBe("/it/s/ABC123");
  });
});

describe("subscriptions", () => {
  let db: AnyDb;
  beforeEach(async () => { db = await createTestDb(); await seedUsers(db, ["Ann", "Bob"]); });
  const sub = (userId: string, endpoint: string, locale = "it") => ({ userId, endpoint, p256dh: "p", auth: "a", locale });

  it("keeps one row per browser and reassigns it to the account that signs in", async () => {
    await saveSubscription(db, sub("u-ann", "https://push/1"));
    await saveSubscription(db, sub("u-bob", "https://push/1", "en"));
    expect(await subscriptionsFor(db, ["u-ann"])).toHaveLength(0);
    const [row] = await subscriptionsFor(db, ["u-bob"]);
    expect(row).toMatchObject({ endpoint: "https://push/1", locale: "en" });
  });

  it("returns every device of the given people and nothing for nobody", async () => {
    await saveSubscription(db, sub("u-ann", "https://push/1"));
    await saveSubscription(db, sub("u-ann", "https://push/2"));
    await saveSubscription(db, sub("u-bob", "https://push/3"));
    expect(await subscriptionsFor(db, ["u-ann"])).toHaveLength(2);
    expect(await subscriptionsFor(db, ["u-ann", "u-bob"])).toHaveLength(3);
    expect(await subscriptionsFor(db, [])).toEqual([]);
  });

  it("a person can remove only their own device", async () => {
    await saveSubscription(db, sub("u-ann", "https://push/1"));
    await removeSubscription(db, "https://push/1", "u-bob"); // someone else: nothing happens
    expect(await subscriptionsFor(db, ["u-ann"])).toHaveLength(1);
    await removeSubscription(db, "https://push/1", "u-ann");
    expect(await subscriptionsFor(db, ["u-ann"])).toHaveLength(0);
  });

  it("removes a dead endpoint and ignores an unknown locale", async () => {
    await saveSubscription(db, sub("u-ann", "https://push/1", "fr"));
    expect((await subscriptionsFor(db, ["u-ann"]))[0].locale).toBe("it");
    await removeSubscription(db, "https://push/1");
    expect(await subscriptionsFor(db, ["u-ann"])).toHaveLength(0);
  });
});
