import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { notifications } from "@/db/schema";
import { newId } from "@/lib/id";

export type NotificationType = "new_log" | "new_comment" | "reaction" | "invite_accepted";

export function buildNotification(userId: string, type: NotificationType, payload: unknown) {
  return {
    id: newId(),
    userId,
    type,
    payloadJson: JSON.stringify(payload),
    isRead: false,
    createdAt: new Date(),
  };
}

export async function notify(db: Db, userId: string, type: NotificationType, payload: unknown) {
  const row = buildNotification(userId, type, payload);
  await db.insert(notifications).values(row);
  return row;
}

export async function listNotifications(db: Db, userId: string) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .all();
}

export async function markRead(db: Db, id: string) {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}
