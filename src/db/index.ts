import "server-only";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

/** Development aid (LOG_QUERIES=1): prints how long every D1 call takes. */
function timed(db: D1Database): D1Database {
  const wrap = (stmt: D1PreparedStatement, text: string): D1PreparedStatement => new Proxy(stmt, {
    get(t, p) {
      const v = (t as unknown as Record<string | symbol, unknown>)[p];
      if (p === "bind") return (...a: unknown[]) => wrap(t.bind(...a), text);
      if (["all", "raw", "run", "first"].includes(p as string)) return async (...a: unknown[]) => { const t0 = performance.now(); try { return await (v as (...x: unknown[]) => unknown).apply(t, a); } finally { console.log("[d1]", (Date.now() % 100000), Math.round(performance.now() - t0) + "ms", text.slice(0, 70).replace(/s+/g, " ")); } };
      return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  });
  return new Proxy(db, { get(t, p) { const v = (t as unknown as Record<string | symbol, unknown>)[p]; if (p === "prepare") return (q: string) => wrap(t.prepare(q), q); return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(t) : v; } });
}

/** D1 is bound per request on Workers: one client per request, shared by every query in it. */
export const getDb = cache(async () => {
  const { env } = await getCloudflareContext({ async: true });
  // LOG_QUERIES=1 prints every query (development aid: count them per page, D1 allows ~50 per request).
  return drizzle(process.env.LOG_QUERIES ? timed(env.DB) : env.DB, { schema, logger: process.env.LOG_QUERIES ? { logQuery: (q) => console.log("[sql]", (Date.now() % 100000), q.slice(0, 110).replace(/s+/g, " ")) } : false });
});

export type Db = Awaited<ReturnType<typeof getDb>>;

/** Runs several writes as one D1 transaction (one round trip, all-or-nothing). Empty list is a no-op. */
export async function atomically(items: (BatchItem<"sqlite"> | false | null | undefined)[]) {
  const writes = items.filter(Boolean) as BatchItem<"sqlite">[];
  if (writes.length === 0) return;
  const db = await getDb();
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
export { schema };
