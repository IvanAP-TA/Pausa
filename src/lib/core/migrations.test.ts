import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

const statements = (file: string) =>
  readFileSync(`./drizzle/${file}`, "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

describe("migration 0002 (invites)", () => {
  it("turns every existing circle's invite_code into a non-expiring invite, and drops the old column", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    for (const f of ["0000_sweet_puppet_master.sql", "0001_serata.sql"]) for (const s of statements(f)) db.run(s);

    db.run("INSERT INTO user (id, name, email) VALUES ('u1', 'Ann', 'ann@test.dev'), ('u2', 'Bob', 'bob@test.dev')");
    db.run("INSERT INTO circle (id, name, invite_code, created_by) VALUES ('c1', 'Divano', 'DIVANO24', 'u1'), ('c2', 'Altro', 'ALTRO999', 'u2')");

    for (const s of statements("0002_invites.sql")) db.run(s);

    const invites = db.exec("SELECT circle_id, code, uses, expires_at, max_uses, revoked_at FROM invite ORDER BY circle_id")[0].values;
    expect(invites).toEqual([
      ["c1", "DIVANO24", 0, null, null, null],
      ["c2", "ALTRO999", 0, null, null, null],
    ]);
    const circleColumns = db.exec("PRAGMA table_info(circle)")[0].values.map((r) => r[1]);
    expect(circleColumns).not.toContain("invite_code");
    expect(db.exec("SELECT name FROM circle ORDER BY id")[0].values).toEqual([["Divano"], ["Altro"]]);
  });
});
