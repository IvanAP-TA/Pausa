import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { circle, circleMember, comment, favorite, invite, list, listItem, log, mediaEntity, nowWatching, user } from "../../db/schema";
import type { AnyDb } from "./db-types";

/* Account: profile, data export, deletion. Pausa's users are in the EU, so these are part of launching, not extras. */

export async function updateProfile(db: AnyDb, input: { userId: string; name: string; image?: string | null }) {
  await db.update(user).set({ name: input.name, ...(input.image !== undefined ? { image: input.image } : {}), updatedAt: new Date() }).where(eq(user.id, input.userId));
}

/**
 * Everything Pausa holds about a person, as plain data (GDPR art. 15/20): profile, logs with their comments, lists, Cerchie.
 * Other people's content is not included, except their comments on this person's logs, which they wrote in this person's thread.
 */
export async function exportAccountData(db: AnyDb, userId: string) {
  const [profile] = await db.select({ id: user.id, name: user.name, email: user.email, locale: user.locale, bio: user.bio, favoriteGenres: user.favoriteGenres, createdAt: user.createdAt }).from(user).where(eq(user.id, userId));
  const [circles, logs, comments, lists, watching, favorites] = await Promise.all([
    db.select({ id: circle.id, name: circle.name, role: circleMember.role, joinedAt: circleMember.joinedAt })
      .from(circleMember).innerJoin(circle, eq(circle.id, circleMember.circleId)).where(eq(circleMember.userId, userId)),
    db.select({
      id: log.id, title: mediaEntity.originalTitle, kind: mediaEntity.kind, year: mediaEntity.year, watchedOn: log.watchedOn, rating: log.rating,
      review: log.review, platform: log.platform, isRewatch: log.isRewatch, createdAt: log.createdAt,
    }).from(log).innerJoin(mediaEntity, eq(mediaEntity.id, log.mediaId)).where(eq(log.userId, userId)).orderBy(asc(log.watchedOn)),
    db.select({ id: comment.id, logId: comment.logId, body: comment.body, createdAt: comment.createdAt }).from(comment).where(eq(comment.userId, userId)),
    db.select({ id: list.id, name: list.name, kind: list.kind, circleId: list.circleId }).from(list).where(eq(list.ownerId, userId)),
    db.select({ title: mediaEntity.originalTitle, progress: nowWatching.progress }).from(nowWatching).innerJoin(mediaEntity, eq(mediaEntity.id, nowWatching.mediaId)).where(eq(nowWatching.userId, userId)),
    db.select({ title: mediaEntity.originalTitle, year: mediaEntity.year }).from(favorite).innerJoin(mediaEntity, eq(mediaEntity.id, favorite.mediaId)).where(eq(favorite.userId, userId)).orderBy(asc(favorite.position)),
  ]);
  const listIds = lists.map((l) => l.id);
  const items = listIds.length
    ? await db.select({ listId: listItem.listId, title: mediaEntity.originalTitle, position: listItem.position })
      .from(listItem).innerJoin(mediaEntity, eq(mediaEntity.id, listItem.mediaId)).where(inArray(listItem.listId, listIds)).orderBy(asc(listItem.position))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    profile,
    circles,
    logs,
    comments,
    lists: lists.map((l) => ({ ...l, items: items.filter((i) => i.listId === l.id).map((i) => i.title) })),
    nowWatching: watching[0] ?? null,
    favorites,
  };
}

/**
 * Deletes the account and what is theirs alone. Rows that reference the user without cascading are first
 * handed on: a Cerchia they created goes to its oldest other member (made admin), or is deleted if they were
 * its only member; invites and list items they added are attributed to that new owner.
 * Everything else (logs, comments, reactions, votes, notices, memberships, sessions) goes by ON DELETE CASCADE.
 */
export async function deleteAccount(db: AnyDb, userId: string) {
  const created = await db.select({ id: circle.id }).from(circle).where(eq(circle.createdBy, userId));
  for (const c of created) {
    const [heir] = await db.select({ userId: circleMember.userId }).from(circleMember)
      .where(and(eq(circleMember.circleId, c.id), ne(circleMember.userId, userId))).orderBy(asc(circleMember.joinedAt)).limit(1);
    if (!heir) {
      await db.delete(circle).where(eq(circle.id, c.id));
      continue;
    }
    await db.update(circleMember).set({ role: "admin" }).where(and(eq(circleMember.circleId, c.id), eq(circleMember.userId, heir.userId)));
    await db.update(circle).set({ createdBy: heir.userId }).where(eq(circle.id, c.id));
    await db.update(invite).set({ createdBy: heir.userId }).where(and(eq(invite.circleId, c.id), eq(invite.createdBy, userId)));
  }
  // Group lists they own stay with the Cerchia (personal lists go with them).
  const groupLists = await db.select({ id: list.id, circleId: list.circleId }).from(list).where(and(eq(list.ownerId, userId), isNotNull(list.circleId)));
  for (const gl of groupLists) {
    const [next] = await db.select({ userId: circleMember.userId }).from(circleMember)
      .where(and(eq(circleMember.circleId, gl.circleId!), ne(circleMember.userId, userId))).orderBy(asc(circleMember.joinedAt)).limit(1);
    if (next) await db.update(list).set({ ownerId: next.userId }).where(eq(list.id, gl.id));
  }
  // Invites made in someone else's Cerchia, and group-list items added by this user, keep working under another member.
  const rest = await db.select({ id: invite.id, circleId: invite.circleId }).from(invite).where(eq(invite.createdBy, userId));
  for (const inv of rest) {
    const [admin] = await db.select({ userId: circleMember.userId }).from(circleMember)
      .where(and(eq(circleMember.circleId, inv.circleId), ne(circleMember.userId, userId))).orderBy(asc(circleMember.joinedAt)).limit(1);
    if (admin) await db.update(invite).set({ createdBy: admin.userId }).where(eq(invite.id, inv.id));
    else await db.delete(invite).where(eq(invite.id, inv.id));
  }
  const added = await db.select({ listId: listItem.listId, mediaId: listItem.mediaId }).from(listItem).where(eq(listItem.addedBy, userId));
  for (const it of added) {
    const [l] = await db.select({ circleId: list.circleId, ownerId: list.ownerId }).from(list).where(eq(list.id, it.listId));
    // Personal lists of this user vanish with them; in a group list, the item stays but is attributed to the list owner or deleted.
    if (!l || l.ownerId === userId) {
      await db.delete(listItem).where(and(eq(listItem.listId, it.listId), eq(listItem.mediaId, it.mediaId)));
    } else {
      await db.update(listItem).set({ addedBy: l.ownerId }).where(and(eq(listItem.listId, it.listId), eq(listItem.mediaId, it.mediaId)));
    }
  }
  await db.delete(user).where(eq(user.id, userId));
}
