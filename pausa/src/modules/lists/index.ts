import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { lists, listItems } from "@/db/schema";
import { newId } from "@/lib/id";

export interface ListScopeInput {
  scope: "personal" | "circle";
  ownerUserId?: string;
  circleId?: string;
}

export function validateListScope(i: ListScopeInput): { ok: boolean } {
  if (i.scope === "personal") return { ok: !!i.ownerUserId && !i.circleId };
  return { ok: !!i.circleId && !i.ownerUserId };
}

export async function createList(
  db: Db,
  i: ListScopeInput & { name: string; isRanked?: boolean },
) {
  if (!validateListScope(i).ok) throw new Error("Invalid list scope");
  const row = {
    id: newId(),
    scope: i.scope,
    ownerUserId: i.ownerUserId ?? null,
    circleId: i.circleId ?? null,
    name: i.name,
    isRanked: i.isRanked ?? false,
    createdAt: new Date(),
  };
  await db.insert(lists).values(row);
  return row;
}

export async function addItem(
  db: Db,
  i: { listId: string; mediaEntityId: string; addedBy: string; position?: number },
) {
  const row = {
    listId: i.listId,
    mediaEntityId: i.mediaEntityId,
    addedBy: i.addedBy,
    position: i.position ?? 0,
    addedAt: new Date(),
  };
  await db.insert(listItems).values(row);
  return row;
}

export async function removeItem(db: Db, listId: string, mediaEntityId: string) {
  await db
    .delete(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.mediaEntityId, mediaEntityId)));
}

export async function listLists(db: Db, i: ListScopeInput) {
  if (i.scope === "personal") {
    return db.select().from(lists).where(eq(lists.ownerUserId, i.ownerUserId!)).all();
  }
  return db.select().from(lists).where(eq(lists.circleId, i.circleId!)).all();
}

export async function listItemsForList(db: Db, listId: string) {
  return db.select().from(listItems).where(eq(listItems.listId, listId)).all();
}
