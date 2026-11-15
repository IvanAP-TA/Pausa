import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { logEntries, comments, reactions } from "@/db/schema";

export interface FeedItem {
  kind: "log" | "comment" | "reaction";
  id: string;
  createdAt: Date;
  data: unknown;
}

export function mergeFeed(logs: any[], cms: any[], rcs: any[]): FeedItem[] {
  const items: FeedItem[] = [
    ...logs.map((d) => ({ kind: "log" as const, id: d.id, createdAt: d.createdAt, data: d })),
    ...cms.map((d) => ({ kind: "comment" as const, id: d.id, createdAt: d.createdAt, data: d })),
    ...rcs.map((d) => ({ kind: "reaction" as const, id: d.id, createdAt: d.createdAt, data: d })),
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getFeed(db: Db, circleId: string, limit = 50): Promise<FeedItem[]> {
  const logs = await db
    .select()
    .from(logEntries)
    .where(eq(logEntries.circleId, circleId))
    .orderBy(desc(logEntries.createdAt))
    .limit(limit)
    .all();
  const logIds = new Set(logs.map((l) => l.id));
  const cms = (await db.select().from(comments).all()).filter((c) => logIds.has(c.logId));
  const rcs = (await db.select().from(reactions).all()).filter(
    (r) => r.targetType === "log" && logIds.has(r.targetId),
  );
  return mergeFeed(logs, cms, rcs).slice(0, limit);
}
