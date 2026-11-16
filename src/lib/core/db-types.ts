import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../../db/schema";

/**
 * Any Drizzle SQLite database: D1 in production, sql.js in tests. Core modules take this as a parameter
 * (and import the schema by relative path), so they run unchanged against a real SQLite in tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result kind differs between D1 (async) and sql.js (sync)
export type AnyDb = BaseSQLiteDatabase<any, any, typeof schema>;
