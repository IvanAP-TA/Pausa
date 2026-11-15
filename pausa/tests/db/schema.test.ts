import { describe, it, expect } from "vitest";
import * as schema from "@/db/schema";

describe("schema", () => {
  it("exports all Fase 1 tables", () => {
    for (const t of [
      "users", "sessions", "circles", "circleMembers", "invites",
      "mediaEntities", "logEntries", "logWatchedWith", "comments",
      "reactions", "lists", "listItems", "notifications",
    ]) {
      expect(schema).toHaveProperty(t);
    }
  });
});
