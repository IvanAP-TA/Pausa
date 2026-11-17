import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../../db/schema";

/**
 * Any Drizzle SQLite database: D1 in production, sql.js in tests. Core modules take this as a parameter
 * (and import the schema by relative path), so they run unchanged against a real SQLite in tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result kind differs between D1 (async) and sql.js (sync)
export type AnyDb = BaseSQLiteDatabase<any, any, typeof schema>;

/**
 * Runs independent reads together. On D1 they travel as ONE batch (one round trip, which is what costs time there);
 * on the test database, which has no batch, they simply run side by side.
 */
export async function readAll<Q extends readonly PromiseLike<unknown>[]>(db: AnyDb, queries: [...Q]): Promise<{ [K in keyof Q]: Awaited<Q[K]> }> {
  const batch = (db as unknown as { batch?: (q: unknown[]) => Promise<unknown[]> }).batch;
  const out = batch ? await batch.call(db, queries as unknown[]) : await Promise.all(queries);
  return out as { [K in keyof Q]: Awaited<Q[K]> };
}
