import "server-only";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

/** D1 is bound per request on Workers: one client per request, shared by every query in it. */
export const getDb = cache(async () => {
  const { env } = await getCloudflareContext({ async: true });
  // LOG_QUERIES=1 prints every query (development aid: count them per page, D1 allows ~50 per request).
  return drizzle(env.DB, { schema, logger: process.env.LOG_QUERIES ? { logQuery: (q) => console.log("[sql]", q.slice(0, 110).replace(/\s+/g, " ")) } : false });
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
