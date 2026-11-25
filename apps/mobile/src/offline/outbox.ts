// The diary's outbox: a viewing written while offline (or whose request died on the way) is kept on the device and sent later, in order.
// Pure logic with injected storage / network / clock, so it is unit-tested without a browser (tests/outbox.test.ts). The React side
// is OutboxProvider.tsx.
//
// Duplicates. POST /api/logs has no idempotency key today, so a request that reached the server but whose answer was lost looks the
// same as one that never left. Two defences:
//   1. every send carries `Idempotency-Key: <entry id>`. The server ignores it until it implements the key (see docs/rebuild/A11Y.md,
//      "server changes"): once it does, a repeat returns the first log and nothing is duplicated, with no heuristic needed.
//   2. until then, an entry that MAY have been received (`maybeSent`: the connection broke after the request started) is not sent
//      blindly: `alreadyThere` re-reads the latest diary page and looks for the same title, day, season/episode, rating and review
//      written after the first attempt. That is a HEURISTIC: it can wrongly drop a real second viewing that is identical in every
//      field and was written in the same minutes from another device (and it only looks at the newest page of the diary).
import { ApiFailure } from "@/api/errors";
import type { NewLogInput } from "@/api/diary";

export type QueuedLog = {
  /** Also the idempotency key. */
  id: string;
  userId: string;
  createdAt: number;
  /** When the first live attempt started (the log may have been created after this moment and before `createdAt`). */
  firstAttemptAt: number;
  input: NewLogInput;
  title: string;
  kind: string;
  posterPath: string | null;
  status: "waiting" | "sending" | "failed";
  maybeSent: boolean;
  attempts: number;
  /** Why it is "failed": the server's code. */
  error?: string;
};

export type OutboxDeps = {
  load: () => Promise<QueuedLog[]>;
  save: (list: QueuedLog[]) => Promise<void>;
  send: (entry: QueuedLog) => Promise<unknown>;
  alreadyThere: (entry: QueuedLog) => Promise<boolean>;
  isOnline: () => boolean;
  now: () => number;
  uuid: () => string;
};

export type NewEntry = Pick<QueuedLog, "userId" | "input" | "title" | "kind" | "posterPath"> & { firstAttemptAt?: number; maybeSent?: boolean };

/** Errors that say "try again later" and never "this entry is wrong": the queue stops there and keeps the order. */
export function isTransient(e: unknown): boolean {
  if (!(e instanceof ApiFailure)) return true; // something unexpected: keep the entry, do not lose a review
  return e.code === "network" || e.code === "rate_limited" || e.code === "unauthorized" || e.code === "catalog_unavailable" || e.status >= 500;
}

const SKEW_MS = 5_000;
const asMs = (n: number) => (n < 1e12 ? n * 1000 : n);

/** The heuristic of point 2 above, on a page of the person's own diary. */
export function looksSent(entry: QueuedLog, page: Array<{ watchedOn: string; media: { title: string }; rating: number | null; review: string | null; season: unknown; episode: unknown; arrivedAt: number }>): boolean {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return page.some(
    (l) =>
      l.watchedOn === entry.input.watchedOn &&
      l.media.title === entry.title &&
      (l.rating ?? null) === (entry.input.rating ?? null) &&
      (l.review ?? null) === (entry.input.review ?? null) &&
      n(l.season) === (entry.input.season ?? null) &&
      n(l.episode) === (entry.input.episode ?? null) &&
      asMs(l.arrivedAt) >= entry.firstAttemptAt - SKEW_MS,
  );
}

export class Outbox {
  private list: QueuedLog[] = [];
  private listeners = new Set<() => void>();
  private running: Promise<number> | null = null;
  private ready: Promise<void> | null = null;

  constructor(private deps: OutboxDeps) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  /** The same array object until something changes (useSyncExternalStore). */
  snapshot = () => this.list;

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  private async commit(next: QueuedLog[]) {
    this.list = next;
    this.emit();
    await this.deps.save(next);
  }

  /** Reads the stored queue once. An entry that was "sending" when the app died may have arrived: it is checked before it is sent again. */
  init(): Promise<void> {
    this.ready ??= this.deps.load().then((stored) => {
      this.list = stored.map((e) => (e.status === "sending" ? { ...e, status: "waiting" as const, maybeSent: true } : e));
      this.emit();
    });
    return this.ready;
  }

  async enqueue(n: NewEntry): Promise<QueuedLog> {
    await this.init();
    const now = this.deps.now();
    const entry: QueuedLog = {
      id: this.deps.uuid(),
      userId: n.userId,
      createdAt: now,
      firstAttemptAt: n.firstAttemptAt ?? now,
      input: n.input,
      title: n.title,
      kind: n.kind,
      posterPath: n.posterPath,
      status: "waiting",
      maybeSent: n.maybeSent ?? false,
      attempts: n.maybeSent || n.firstAttemptAt ? 1 : 0,
    };
    await this.commit([...this.list, entry]);
    return entry;
  }

  /** The entries of one person (the device can be shared: a queue never sends somebody else's viewing). */
  forUser(userId: string) {
    return this.list.filter((e) => e.userId === userId);
  }

  async discard(id: string) {
    await this.commit(this.list.filter((e) => e.id !== id));
  }

  /** A failed entry goes back in line (and keeps its place in the order). */
  async retry(id: string, userId: string): Promise<number> {
    await this.commit(this.list.map((e) => (e.id === id && e.status === "failed" ? { ...e, status: "waiting" as const, error: undefined } : e)));
    return this.flush(userId);
  }

  private patch(id: string, p: Partial<QueuedLog>) {
    return this.commit(this.list.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }

  /** Sends what is waiting, oldest first. Resolves to how many entries are now on the server. One run at a time. */
  flush(userId: string): Promise<number> {
    this.running ??= this.run(userId).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(userId: string): Promise<number> {
    await this.init();
    let done = 0;
    for (const queued of this.forUser(userId)) {
      if (queued.status !== "waiting") continue; // a failed entry does not hold the others back
      let entry = queued;
      await this.patch(entry.id, { status: "sending", attempts: entry.attempts + 1 });
      entry = { ...entry, attempts: entry.attempts + 1 };
      try {
        if (entry.maybeSent && (await this.deps.alreadyThere(entry))) {
          await this.discard(entry.id);
          done++;
          continue;
        }
        await this.deps.send(entry);
        await this.discard(entry.id);
        done++;
      } catch (e) {
        if (isTransient(e)) {
          // The request may have been received when the connection broke; if the device knows it is offline, it was not even sent.
          const ambiguous = e instanceof ApiFailure ? (e.code === "network" ? this.deps.isOnline() : e.status >= 500) : true;
          await this.patch(entry.id, { status: "waiting", maybeSent: entry.maybeSent || ambiguous });
          break; // keep the order: nothing after this one goes first
        }
        await this.patch(entry.id, { status: "failed", error: e instanceof ApiFailure ? e.code : "internal" });
      }
    }
    return done;
  }
}
