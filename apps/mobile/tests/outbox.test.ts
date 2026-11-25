import { describe, expect, it } from "vitest";
import { ApiFailure } from "../src/api/errors";
import { Outbox, looksSent, type OutboxDeps, type QueuedLog } from "../src/offline/outbox";

const input = (day = "2026-11-20", extra: Record<string, unknown> = {}) => ({ watchedOn: day, mediaKey: "tmdb:movie:603", circles: ["c1"], locale: "it", rating: 8, review: null, ...extra }) as QueuedLog["input"];
const base = { userId: "u1", title: "Matrix", kind: "movie", posterPath: null };

type Rig = { outbox: Outbox; sent: QueuedLog[]; disk: { value: QueuedLog[] }; deps: OutboxDeps; state: { online: boolean; fail: Array<unknown>; there: boolean | Error; t: number } };

function rig(initial: QueuedLog[] = []): Rig {
  const disk = { value: initial };
  const sent: QueuedLog[] = [];
  const state = { online: true, fail: [] as unknown[], there: false as boolean | Error, t: 1_000_000 };
  let n = 0;
  const deps: OutboxDeps = {
    load: async () => structuredClone(disk.value),
    save: async (l) => void (disk.value = structuredClone(l)),
    send: async (e) => {
      const f = state.fail.shift();
      if (f) throw f;
      sent.push(e);
      return { id: `log-${sent.length}` };
    },
    alreadyThere: async () => {
      if (state.there instanceof Error) throw state.there;
      return state.there;
    },
    isOnline: () => state.online,
    now: () => (state.t += 10),
    uuid: () => `id-${++n}`,
  };
  return { outbox: new Outbox(deps), sent, disk, deps, state };
}

describe("outbox: order and persistence", () => {
  it("sends in the order they were written, removes what went through, and persists every step", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input("2026-11-01") });
    await r.outbox.enqueue({ ...base, input: input("2026-11-02"), title: "Se7en" });
    expect(r.disk.value.map((e) => e.id)).toEqual(["id-1", "id-2"]);
    expect(await r.outbox.flush("u1")).toBe(2);
    expect(r.sent.map((e) => e.title)).toEqual(["Matrix", "Se7en"]);
    expect(r.outbox.snapshot()).toEqual([]);
    expect(r.disk.value).toEqual([]);
  });

  it("a second Outbox on the same storage (the app was closed) finds the queue and sends it", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    const reopened = new Outbox({ ...r.deps });
    await reopened.init();
    expect(reopened.snapshot()).toHaveLength(1);
    expect(await reopened.flush("u1")).toBe(1);
    expect(r.sent).toHaveLength(1);
  });

  it("a viewing that was 'sending' when the app died is checked against the diary before it is sent again", async () => {
    const stuck: QueuedLog = { ...base, id: "x", createdAt: 1, firstAttemptAt: 1, input: input(), status: "sending", maybeSent: false, attempts: 1 };
    const r = rig([stuck]);
    r.state.there = true; // it did arrive
    expect(await r.outbox.flush("u1")).toBe(1);
    expect(r.sent).toHaveLength(0); // not sent twice
    expect(r.outbox.snapshot()).toEqual([]);
  });

  it("never sends another person's viewing", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    await r.outbox.enqueue({ ...base, userId: "u2", input: input("2026-11-03") });
    expect(await r.outbox.flush("u1")).toBe(1);
    expect(r.outbox.snapshot().map((e) => e.userId)).toEqual(["u2"]);
  });
});

describe("outbox: failures", () => {
  it("a network error keeps the entry and stops the run, so nothing later overtakes it", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input("2026-11-01") });
    await r.outbox.enqueue({ ...base, input: input("2026-11-02"), title: "Se7en" });
    r.state.fail = [new ApiFailure("network", 0)];
    expect(await r.outbox.flush("u1")).toBe(0);
    expect(r.sent).toHaveLength(0);
    expect(r.outbox.snapshot().map((e) => [e.title, e.status])).toEqual([["Matrix", "waiting"], ["Se7en", "waiting"]]);
    expect(await r.outbox.flush("u1")).toBe(2);
    expect(r.sent.map((e) => e.title)).toEqual(["Matrix", "Se7en"]);
  });

  it("offline at the moment of the failure: the request never left, so there is nothing to check later", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    r.state.online = false;
    r.state.fail = [new ApiFailure("network", 0)];
    await r.outbox.flush("u1");
    expect(r.outbox.snapshot()[0].maybeSent).toBe(false);
  });

  it("a network error while the device thinks it is online MAY have been received: the next run re-reads the diary first", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    r.state.fail = [new ApiFailure("network", 0)];
    await r.outbox.flush("u1");
    expect(r.outbox.snapshot()[0].maybeSent).toBe(true);
    r.state.there = true; // the first request had actually succeeded
    expect(await r.outbox.flush("u1")).toBe(1);
    expect(r.sent).toHaveLength(0); // no duplicate
    expect(r.outbox.snapshot()).toEqual([]);
  });

  it("when the diary does not have it, a maybe-sent entry is sent", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input(), maybeSent: true, firstAttemptAt: 5 });
    r.state.there = false;
    expect(await r.outbox.flush("u1")).toBe(1);
    expect(r.sent).toHaveLength(1);
  });

  it("if the check itself cannot reach the server, the entry waits (it is neither sent blind nor lost)", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input(), maybeSent: true, firstAttemptAt: 5 });
    r.state.there = new ApiFailure("network", 0);
    expect(await r.outbox.flush("u1")).toBe(0);
    expect(r.sent).toHaveLength(0);
    expect(r.outbox.snapshot()[0].status).toBe("waiting");
  });

  it("a refusal (invalid) marks only that entry as failed; the next ones still go; retry puts it back in line", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input("2026-11-01") });
    await r.outbox.enqueue({ ...base, input: input("2026-11-02"), title: "Se7en" });
    r.state.fail = [new ApiFailure("invalid", 400)];
    expect(await r.outbox.flush("u1")).toBe(1);
    expect(r.sent.map((e) => e.title)).toEqual(["Se7en"]);
    expect(r.outbox.snapshot()).toMatchObject([{ title: "Matrix", status: "failed", error: "invalid" }]);
    // a flush leaves it alone ...
    expect(await r.outbox.flush("u1")).toBe(0);
    // ... until the person asks
    expect(await r.outbox.retry("id-1", "u1")).toBe(1);
    expect(r.outbox.snapshot()).toEqual([]);
  });

  it("rate limit, server error and a lost session are transient: the entry is kept", async () => {
    for (const f of [new ApiFailure("rate_limited", 429, 30), new ApiFailure("internal", 503), new ApiFailure("unauthorized", 401)]) {
      const r = rig();
      await r.outbox.enqueue({ ...base, input: input() });
      r.state.fail = [f];
      await r.outbox.flush("u1");
      expect(r.outbox.snapshot()[0].status).toBe("waiting");
    }
  });

  it("discard removes an entry for good", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    await r.outbox.discard("id-1");
    expect(r.outbox.snapshot()).toEqual([]);
    expect(r.disk.value).toEqual([]);
  });

  it("two flushes at once are one run (no double send)", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    const [a, b] = await Promise.all([r.outbox.flush("u1"), r.outbox.flush("u1")]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(r.sent).toHaveLength(1);
  });

  it("every send carries the entry id (the idempotency key the server will honour)", async () => {
    const r = rig();
    await r.outbox.enqueue({ ...base, input: input() });
    await r.outbox.flush("u1");
    expect(r.sent[0].id).toBe("id-1");
  });
});

describe("the 'already there' heuristic", () => {
  const entry: QueuedLog = { ...base, id: "e", createdAt: 1_795_614_002_000, firstAttemptAt: 1_795_614_000_000, input: input("2026-11-20", { rating: 8, season: 1, episode: 2 }), status: "waiting", maybeSent: true, attempts: 1 };
  const row = (over: Record<string, unknown> = {}) => ({ watchedOn: "2026-11-20", media: { title: "Matrix" }, rating: 8, review: null, season: 1n, episode: 2n, arrivedAt: 1_795_614_001_000, ...over });

  it("matches the same title, day, rating, review and episode written after the first attempt", () => {
    expect(looksSent(entry, [row()])).toBe(true);
    expect(looksSent(entry, [row({ arrivedAt: 1_795_614_001 })])).toBe(true); // seconds too
  });
  it("does not match an older viewing (a rewatch from last week) or a different one", () => {
    expect(looksSent(entry, [row({ arrivedAt: 1_795_000_000_000 })])).toBe(false);
    expect(looksSent(entry, [row({ watchedOn: "2026-11-19" })])).toBe(false);
    expect(looksSent(entry, [row({ rating: 6 })])).toBe(false);
    expect(looksSent(entry, [row({ episode: 3n })])).toBe(false);
    expect(looksSent(entry, [row({ media: { title: "Se7en" } })])).toBe(false);
    expect(looksSent(entry, [row({ review: "other" })])).toBe(false);
    expect(looksSent(entry, [])).toBe(false);
  });
});
