import type { ChunkResult, ListChunkResult } from "@pausa/api-types";
import { ApiFailure } from "@/api/errors";
import type { RowsInput, ListRowsInput, WireRow } from "@/api/import";
import type { ImportList, ImportRow } from "./parsers";

/** Up to this many rows per call (the server's cap). The server may handle fewer: it says how many from the start (`processed`). */
export const CHUNK = 30;
export const LIST_CHUNK = 20;
/** Calls that fail one after another before the import stops with an error (progress is kept: it can be resumed). */
export const MAX_FAILURES = 3;

/** The calls the loop makes: the real client in the app, a fake in the tests. */
export type RunnerApi = {
  rows: (batchId: string, input: RowsInput) => Promise<ChunkResult>;
  lists: (batchId: string, input: ListRowsInput) => Promise<ListChunkResult>;
  finish: (batchId: string) => Promise<unknown>;
};

export type Totals = { imported: number; already: number; newTitles: number; skippedUndated: number; listItems: number; lists: number };
export type RejectedRow = { index: number; title: string; reason: string };
export type Progress = { done: number; total: number };

export type RunOptions = {
  batchId: string;
  rows: ImportRow[];
  lists: ImportList[];
  /** Where the loop starts in `rows`: 0 for a new import, the server's `cursor` to resume one. */
  startAt: number;
  includeReviews: boolean;
  includeUndated: boolean;
  locale: string;
  api: RunnerApi;
  /** Asked before every call: true = stop here (what is done is kept, the import stays resumable). */
  shouldStop: () => boolean;
  onProgress: (p: Progress, totals: Totals) => void;
  /** Wait before sending a failed call again. Tests pass an instant one. */
  wait?: (ms: number) => Promise<void>;
};

export type RunStatus = "done" | "stopped" | "limited" | "failed";
export type RunResult = { status: RunStatus; totals: Totals; rejected: RejectedRow[]; cursor: number; progress: Progress; error?: unknown };

/** The row as the server takes it: only the fields it knows, `review` cut when the person left reviews out. */
export function wire(r: ImportRow, includeReviews: boolean): WireRow {
  return {
    kind: r.kind,
    title: r.title,
    year: r.year,
    rating: r.rating,
    watchedOn: r.watchedOn,
    rewatch: r.rewatch,
    review: includeReviews ? r.review : null,
    letterboxdUri: r.letterboxdUri ?? null,
    anilistId: r.anilistId ?? null,
    malId: r.malId ?? null,
    tmdbId: r.tmdbId ?? null,
    imdbId: r.imdbId ?? null,
  };
}

const isLimit = (e: unknown) => e instanceof ApiFailure && e.code === "rate_limited";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The chunk loop. Each call sends up to 30 rows from the START of what is left; the answer's `processed` says how many of those the
 * server took (it may take fewer: it has a limit on outgoing requests per call), and the next call starts there. A 429 stops at once
 * ("try again in an hour"); three failed calls in a row stop with an error; the person can stop between calls. In every stop the work
 * already done stays on the server and the import stays open, so it can be resumed from the server's cursor.
 */
export async function runImport(o: RunOptions): Promise<RunResult> {
  const wait = o.wait ?? sleep;
  const totals: Totals = { imported: 0, already: 0, newTitles: 0, skippedUndated: 0, listItems: 0, lists: 0 };
  const rejected: RejectedRow[] = [];
  const total = o.rows.length + o.lists.reduce((n, l) => n + l.rows.length, 0);
  let offset = Math.min(Math.max(0, o.startAt), o.rows.length);
  let listsDone = 0;
  let failures = 0;
  let idle = 0; // calls that came back handling nothing, one after another
  const progress = (): Progress => ({ done: Math.min(total, offset + o.lists.slice(0, listsDone).reduce((n, l) => n + l.rows.length, 0) + listPart), total });
  let listPart = 0;
  const result = (status: RunStatus, error?: unknown): RunResult => ({ status, totals, rejected, cursor: offset, progress: progress(), error });
  o.onProgress(progress(), totals);

  /** Runs one call, retrying the same call after a failure until three in a row. Returns the answer, or the stop to report. */
  async function attempt<T>(call: () => Promise<T>): Promise<{ ok: T } | { stop: RunResult }> {
    for (;;) {
      if (o.shouldStop()) return { stop: result("stopped") };
      try {
        const ok = await call();
        failures = 0;
        return { ok };
      } catch (e) {
        if (isLimit(e)) return { stop: result("limited", e) };
        if (++failures >= MAX_FAILURES) return { stop: result("failed", e) };
        await wait(500 * failures);
      }
    }
  }

  while (offset < o.rows.length) {
    const part = o.rows.slice(offset, offset + CHUNK);
    const at = offset;
    const step = await attempt(() => o.api.rows(o.batchId, { rows: part.map((r) => wire(r, o.includeReviews)), offset: at, includeReviews: o.includeReviews, includeUndated: o.includeUndated, locale: o.locale }));
    if ("stop" in step) return step.stop;
    const res = step.ok;
    // Nothing handled would loop forever: count it as a failed call.
    if (!(res.processed > 0)) {
      if (++idle >= MAX_FAILURES) return result("failed");
      await wait(500 * idle);
      continue;
    }
    idle = 0;
    totals.imported += res.imported;
    totals.already += res.already;
    totals.newTitles += res.newTitles;
    totals.skippedUndated += res.skippedUndated;
    for (const r of res.rejected) rejected.push({ index: at + r.index, title: part[r.index]?.title ?? "", reason: r.reason });
    offset += Math.min(res.processed, part.length);
    o.onProgress(progress(), totals);
  }

  for (const list of o.lists) {
    let at = 0;
    let counted = false;
    while (at < list.rows.length) {
      const part = list.rows.slice(at, at + LIST_CHUNK);
      const from = at;
      const step = await attempt(() => o.api.lists(o.batchId, { name: list.name, description: list.description, kind: list.kind, offset: from, rows: part.map((r) => wire(r, false)), locale: o.locale }));
      if ("stop" in step) return step.stop;
      const res = step.ok;
      if (!(res.processed > 0)) {
        if (++idle >= MAX_FAILURES) return result("failed");
        await wait(500 * idle);
        continue;
      }
      idle = 0;
      totals.listItems += res.added;
      totals.newTitles += res.newTitles;
      for (const r of res.rejected) rejected.push({ index: from + r.index, title: part[r.index]?.title ?? "", reason: r.reason });
      at += Math.min(res.processed, part.length);
      listPart = at;
      counted = true;
      o.onProgress(progress(), totals);
    }
    listPart = 0;
    listsDone++;
    if (counted) totals.lists++;
  }

  const closed = await attempt(() => o.api.finish(o.batchId));
  if ("stop" in closed) return closed.stop;
  o.onProgress(progress(), totals);
  return result("done");
}
