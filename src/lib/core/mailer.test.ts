import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { circle, log, mediaEntity, notification, user } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { renderDigest, runDigests } from "./mailer";
import { createTestDb, seedUsers } from "./test-db";

const NOW = new Date("2026-12-01T17:00:00Z");
let db: AnyDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedUsers(db, ["Ann", "Bob"]);
  await db.insert(circle).values({ id: "c1", name: "Divano", createdBy: "u-ann" });
  await db.insert(mediaEntity).values({ id: "m1", kind: "movie", originalTitle: "Alpha <b>" });
  await db.insert(log).values({ id: "l1", userId: "u-bob", mediaId: "m1", watchedOn: "2026-11-30" });
  await db.update(user).set({ emailDigest: true, locale: "en" }).where(eq(user.id, "u-ann"));
  await db.insert(notification).values({ userId: "u-ann", type: "log", actorId: "u-bob", circleId: "c1", logId: "l1", createdAt: new Date(NOW.getTime() - 3_600_000) });
});
afterEach(() => vi.restoreAllMocks());

describe("digest email", () => {
  it("renders text and HTML in the person's language, escaping what people wrote", async () => {
    const { pendingDigests } = await import("./digest");
    const [d] = await pendingDigests(db, NOW);
    const mail = renderDigest(d, "https://pausa.gnagno.org/");
    expect(mail.subject).toBe("What you missed on Pausa");
    expect(mail.text).toContain("Divano: Bob watched Alpha <b>");
    expect(mail.text).toContain("https://pausa.gnagno.org/en");
    expect(mail.html).toContain("Alpha &#60;b&#62;"); // a title can never inject markup
    expect(mail.html).not.toContain("<b>");
  });

  it("sends through Resend and moves the window only for emails that went out", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await runDigests(db, { apiKey: "k", appUrl: "https://pausa.gnagno.org" }, NOW)).toEqual({ due: 1, sent: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["ann@test.dev"]);
    expect(await runDigests(db, { apiKey: "k", appUrl: "https://pausa.gnagno.org" }, NOW)).toEqual({ due: 0, sent: 0 }); // same notice is not sent twice
  });

  it("a failing provider leaves the person due for next time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await runDigests(db, { apiKey: "k", appUrl: "https://x" }, NOW)).toEqual({ due: 1, sent: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await runDigests(db, { apiKey: "k", appUrl: "https://x" }, NOW)).toEqual({ due: 1, sent: 1 });
  });

  it("without an API key nothing is sent and nobody is marked", async () => {
    expect(await runDigests(db, { appUrl: "https://x" }, NOW)).toEqual({ due: 1, sent: 0 });
  });
});
