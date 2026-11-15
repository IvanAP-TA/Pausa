import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { nowWatching, mediaEntities, users } from "@/db/schema";
import { newId } from "@/lib/id";

export async function setNowWatching(db: Db, userId: string, circleId: string, mediaEntityId: string) {
  await db
    .delete(nowWatching)
    .where(and(eq(nowWatching.userId, userId), eq(nowWatching.circleId, circleId)));
  const row = { id: newId(), userId, circleId, mediaEntityId, startedAt: new Date() };
  await db.insert(nowWatching).values(row);
  return row;
}

export async function clearNowWatching(db: Db, userId: string, circleId: string) {
  await db
    .delete(nowWatching)
    .where(and(eq(nowWatching.userId, userId), eq(nowWatching.circleId, circleId)));
}

export async function listNowWatching(db: Db, circleId: string) {
  return db
    .select({ row: nowWatching, media: mediaEntities, user: users })
    .from(nowWatching)
    .innerJoin(mediaEntities, eq(mediaEntities.id, nowWatching.mediaEntityId))
    .innerJoin(users, eq(users.id, nowWatching.userId))
    .where(eq(nowWatching.circleId, circleId))
    .all();
}
