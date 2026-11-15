import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { logEntries, logWatchedWith, comments, reactions } from "@/db/schema";
import { newId } from "@/lib/id";
import { isValidRating } from "./rating";

export interface CreateLogInput {
  circleId: string;
  userId: string;
  mediaEntityId: string;
  rating?: number | null;
  watchedOn?: Date | null;
  platform?: string | null;
  watchedWith?: string[];
}

export async function createLog(db: Db, input: CreateLogInput) {
  const rating = input.rating ?? null;
  if (!isValidRating(rating)) throw new Error("Invalid rating");
  const log = {
    id: newId(),
    circleId: input.circleId,
    userId: input.userId,
    mediaEntityId: input.mediaEntityId,
    rating,
    watchedOn: input.watchedOn ?? null,
    platform: input.platform ?? null,
    createdAt: new Date(),
  };
  await db.insert(logEntries).values(log);
  for (const memberUserId of input.watchedWith ?? []) {
    await db.insert(logWatchedWith).values({ logId: log.id, memberUserId });
  }
  return log;
}

export async function addComment(
  db: Db,
  i: { logId: string; userId: string; body: string; isSpoiler?: boolean },
) {
  const row = {
    id: newId(),
    logId: i.logId,
    userId: i.userId,
    body: i.body,
    isSpoiler: i.isSpoiler ?? false,
    createdAt: new Date(),
  };
  await db.insert(comments).values(row);
  return row;
}

export async function addReaction(
  db: Db,
  i: { targetType: "log" | "comment"; targetId: string; userId: string; emoji: string },
) {
  const row = { id: newId(), ...i, createdAt: new Date() };
  await db.insert(reactions).values(row);
  return row;
}

export async function listLogs(db: Db, circleId: string) {
  return db
    .select()
    .from(logEntries)
    .where(eq(logEntries.circleId, circleId))
    .orderBy(desc(logEntries.createdAt))
    .all();
}
