import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { migrate } from "drizzle-orm/sql-js/migrator";
import * as schema from "../../db/schema";
import type { AnyDb } from "./db-types";

/**
 * A fresh in-memory SQLite (sql.js, WebAssembly: no native build) with the real migrations applied and
 * foreign keys on, like D1. Tests run the same queries the app runs.
 */
export async function createTestDb(onQuery?: (sql: string, params: unknown[]) => void): Promise<AnyDb> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema, logger: onQuery ? { logQuery: (q, p) => onQuery(q, p) } : undefined });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as AnyDb;
}

export async function seedUsers(db: AnyDb, names: string[]) {
  const rows = names.map((name) => ({ id: `u-${name.toLowerCase()}`, name, email: `${name.toLowerCase()}@test.dev` }));
  await db.insert(schema.user).values(rows);
  return rows.map((r) => r.id);
}
