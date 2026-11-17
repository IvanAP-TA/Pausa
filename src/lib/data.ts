import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, like, lt, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";

/* Localized title: media_title for the locale, else the original title. */
const titleFor = (locale: string) =>
  sql<string>`coalesce((select ${s.mediaTitle.title} from ${s.mediaTitle} where ${s.mediaTitle.mediaId} = ${s.mediaEntity.id} and ${s.mediaTitle.locale} = ${locale}), ${s.mediaEntity.originalTitle})`;

const mediaFields = (locale: string) => ({
  id: s.mediaEntity.id,
  kind: s.mediaEntity.kind,
  title: titleFor(locale),
  year: s.mediaEntity.year,
  posterPath: s.mediaEntity.posterPath,
});

export type MediaSummary = { id: string; kind: "movie" | "tv" | "anime"; title: string; year: number | null; posterPath: string | null };

/* ───────────── Cerchie ───────────── */

export async function getMyCircles(userId: string) {
  const db = await getDb();
  return db
    .select({ id: s.circle.id, name: s.circle.name, role: s.circleMember.role })
    .from(s.circleMember)
    .innerJoin(s.circle, eq(s.circle.id, s.circleMember.circleId))
    .where(eq(s.circleMember.userId, userId))
    .orderBy(asc(s.circleMember.joinedAt));
}

/** Returns the circle only if the user is a member. Every circle read goes through this. */
export const getCircleForMember = cache(async (circleId: string, userId: string) => {
  const db = await getDb();
  const [row] = await db
    .select({ id: s.circle.id, name: s.circle.name, role: s.circleMember.role })
    .from(s.circle)
    .innerJoin(s.circleMember, and(eq(s.circleMember.circleId, s.circle.id), eq(s.circleMember.userId, userId)))
    .where(eq(s.circle.id, circleId));
  return row ?? null;
});

export const getMembers = cache(async (circleId: string) => {
  const db = await getDb();
  return db
    .select({ id: s.user.id, name: s.user.name, image: s.user.image, role: s.circleMember.role, joinedAt: s.circleMember.joinedAt })
    .from(s.circleMember)
    .innerJoin(s.user, eq(s.user.id, s.circleMember.userId))
    .where(eq(s.circleMember.circleId, circleId))
    .orderBy(asc(s.circleMember.joinedAt));
});

export async function getCircleStats(circleId: string, year: number) {
  const db = await getDb();
  const [row] = await db
    .select({ logs: sql<number>`count(*)` })
    .from(s.log)
    .innerJoin(s.circleMember, and(eq(s.circleMember.userId, s.log.userId), eq(s.circleMember.circleId, circleId)))
    .where(like(s.log.watchedOn, `${year}-%`));
  return { logsThisYear: row?.logs ?? 0 };
}

/* ───────────── Feed ───────────── */

export async function getCircleFeed(circleId: string, viewerId: string, locale: string, limit = 30, logId?: string, before?: Date) {
  const db = await getDb();
  const logs = await db
    .select({
      id: s.log.id,
      watchedOn: s.log.watchedOn,
      rating: s.log.rating,
      review: s.log.review,
      containsSpoilers: s.log.containsSpoilers,
      platform: s.log.platform,
      season: s.log.season,
      episode: s.log.episode,
      isRewatch: s.log.isRewatch,
      createdAt: s.log.createdAt,
      author: { id: s.user.id, name: s.user.name, image: s.user.image },
      media: mediaFields(locale),
    })
    .from(s.log)
    .innerJoin(s.circleMember, and(eq(s.circleMember.userId, s.log.userId), eq(s.circleMember.circleId, circleId)))
    .innerJoin(s.user, eq(s.user.id, s.log.userId))
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.log.mediaId))
    .where(and(logId ? eq(s.log.id, logId) : undefined, before ? lt(s.log.createdAt, before) : undefined))
    .orderBy(desc(s.log.createdAt))
    .limit(limit);

  const ids = logs.map((l) => l.id);
  if (ids.length === 0) return [];

  const [withRows, reactionRows, commentRows] = await Promise.all([
    db.select({ logId: s.logWatchedWith.logId, id: s.user.id, name: s.user.name })
      .from(s.logWatchedWith).innerJoin(s.user, eq(s.user.id, s.logWatchedWith.userId))
      .where(inArray(s.logWatchedWith.logId, ids)),
    db.select({ logId: s.reaction.logId, emoji: s.reaction.emoji, userId: s.reaction.userId })
      .from(s.reaction).where(inArray(s.reaction.logId, ids)),
    db.select({ logId: s.comment.logId, n: sql<number>`count(*)` })
      .from(s.comment).where(inArray(s.comment.logId, ids)).groupBy(s.comment.logId),
  ]);

  return logs.map((l) => {
    const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of reactionRows) {
      if (r.logId !== l.id) continue;
      const c = counts.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
      c.count += 1;
      if (r.userId === viewerId) c.mine = true;
      counts.set(r.emoji, c);
    }
    return {
      ...l,
      watchedWith: withRows.filter((w) => w.logId === l.id).map(({ id, name }) => ({ id, name })),
      reactions: [...counts.values()],
      commentCount: commentRows.find((c) => c.logId === l.id)?.n ?? 0,
    };
  });
}

export type FeedLog = Awaited<ReturnType<typeof getCircleFeed>>[number];

/** A single log, only if its author belongs to this Cerchia (the viewer's membership is checked by the layout). */
export async function getLogInCircle(circleId: string, logId: string, viewerId: string, locale: string) {
  const [log] = await getCircleFeed(circleId, viewerId, locale, 1, logId);
  return log ?? null;
}

export async function getComments(logId: string) {
  const db = await getDb();
  return db
    .select({ id: s.comment.id, body: s.comment.body, isSpoiler: s.comment.isSpoiler, createdAt: s.comment.createdAt, author: { id: s.user.id, name: s.user.name, image: s.user.image } })
    .from(s.comment)
    .innerJoin(s.user, eq(s.user.id, s.comment.userId))
    .where(eq(s.comment.logId, logId))
    .orderBy(asc(s.comment.createdAt));
}

/** Author id if the viewer shares at least one Cerchia with the log's author, else null. */
export async function logVisibleTo(logId: string, viewerId: string) {
  const db = await getDb();
  const [row] = await db.select({ authorId: s.log.userId, mediaId: s.log.mediaId }).from(s.log).where(eq(s.log.id, logId));
  if (!row) return null;
  if (row.authorId === viewerId) return row;
  const viewerCircles = db.select({ id: s.circleMember.circleId }).from(s.circleMember).where(eq(s.circleMember.userId, viewerId));
  const [shared] = await db.select({ c: s.circleMember.circleId }).from(s.circleMember)
    .where(and(eq(s.circleMember.userId, row.authorId), inArray(s.circleMember.circleId, viewerCircles))).limit(1);
  return shared ? row : null;
}

export async function getMyNowWatching(userId: string, locale: string) {
  const db = await getDb();
  const [row] = await db
    .select({ progress: s.nowWatching.progress, season: s.nowWatching.season, episode: s.nowWatching.episode, media: mediaFields(locale) })
    .from(s.nowWatching)
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.nowWatching.mediaId))
    .where(eq(s.nowWatching.userId, userId));
  return row ?? null;
}

/* ───────────── Notifiche ───────────── */

export async function getNotifications(userId: string, locale: string, limit = 50) {
  const db = await getDb();
  // The title a notice is about: through its log, or directly (e.g. "now watching" has no log).
  const logMedia = sql<string | null>`coalesce(
    (select ${titleFor(locale)} from ${s.log} join ${s.mediaEntity} on ${s.mediaEntity.id} = ${s.log.mediaId} where ${s.log.id} = ${s.notification.logId}),
    (select ${titleFor(locale)} from ${s.mediaEntity} where ${s.mediaEntity.id} = ${s.notification.mediaId}))`;
  return db
    .select({
      id: s.notification.id,
      type: s.notification.type,
      circleId: s.notification.circleId,
      circleName: s.circle.name,
      logId: s.notification.logId,
      readAt: s.notification.readAt,
      createdAt: s.notification.createdAt,
      actor: { id: s.user.id, name: s.user.name, image: s.user.image },
      mediaTitle: logMedia,
    })
    .from(s.notification)
    .leftJoin(s.user, eq(s.user.id, s.notification.actorId))
    .leftJoin(s.circle, eq(s.circle.id, s.notification.circleId))
    .where(eq(s.notification.userId, userId))
    .orderBy(desc(s.notification.createdAt))
    .limit(limit);
}

export async function getUnreadCount(userId: string) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(s.notification)
    .where(and(eq(s.notification.userId, userId), sql`${s.notification.readAt} is null`));
  return row?.n ?? 0;
}

export async function getNowWatching(circleId: string, locale: string, viewerId: string) {
  const db = await getDb();
  const [c] = await db.select({ live: s.circle.liveWatching }).from(s.circle).where(eq(s.circle.id, circleId));
  const [me] = await db.select({ hide: s.circleMember.hideWatching }).from(s.circleMember)
    .where(and(eq(s.circleMember.circleId, circleId), eq(s.circleMember.userId, viewerId)));
  if (!c?.live || me?.hide) return [];
  return db
    .select({ user: { id: s.user.id, name: s.user.name, image: s.user.image }, progress: s.nowWatching.progress, season: s.nowWatching.season, episode: s.nowWatching.episode, updatedAt: s.nowWatching.updatedAt, media: mediaFields(locale) })
    .from(s.nowWatching)
    .innerJoin(s.circleMember, and(eq(s.circleMember.userId, s.nowWatching.userId), eq(s.circleMember.circleId, circleId)))
    .innerJoin(s.user, eq(s.user.id, s.nowWatching.userId))
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.nowWatching.mediaId))
    .orderBy(desc(s.nowWatching.updatedAt));
}

/* ───────────── Liste ───────────── */

/** Group lists of a Cerchia, or (with `ownerId`) the user's personal lists. */
export async function getCircleLists(circleId: string | null, locale: string, ownerId?: string) {
  const db = await getDb();
  const lists = await db
    .select({ id: s.list.id, name: s.list.name, kind: s.list.kind, description: s.list.description, owner: s.user.name, ownerId: s.list.ownerId })
    .from(s.list)
    .innerJoin(s.user, eq(s.user.id, s.list.ownerId))
    .where(circleId ? eq(s.list.circleId, circleId) : and(sql`${s.list.circleId} is null`, eq(s.list.ownerId, ownerId ?? "")))
    .orderBy(asc(s.list.createdAt));
  if (lists.length === 0) return [];
  const items = await db
    .select({ listId: s.listItem.listId, position: s.listItem.position, media: mediaFields(locale) })
    .from(s.listItem)
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.listItem.mediaId))
    .where(inArray(s.listItem.listId, lists.map((l) => l.id)))
    .orderBy(asc(s.listItem.position), asc(s.listItem.addedAt));
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.listId === l.id).map((i) => i.media) }));
}

/** Lists the user can add a title to from this Cerchia: its group lists + their personal ones. */
export async function getListTargets(circleId: string, userId: string) {
  const db = await getDb();
  return db
    .select({ id: s.list.id, name: s.list.name, personal: sql<number>`${s.list.circleId} is null` })
    .from(s.list)
    .where(or(eq(s.list.circleId, circleId), and(sql`${s.list.circleId} is null`, eq(s.list.ownerId, userId))))
    .orderBy(asc(s.list.createdAt));
}

/* ───────────── Media ───────────── */

export async function searchLocalMedia(q: string, locale: string, limit = 12): Promise<MediaSummary[]> {
  const db = await getDb();
  const pattern = `%${q.trim()}%`;
  return db
    .select(mediaFields(locale))
    .from(s.mediaEntity)
    .where(or(
      like(s.mediaEntity.originalTitle, pattern),
      sql`exists (select 1 from ${s.mediaTitle} where ${s.mediaTitle.mediaId} = ${s.mediaEntity.id} and ${s.mediaTitle.title} like ${pattern})`,
    ))
    .limit(limit);
}

export async function getMedia(id: string, locale: string): Promise<MediaSummary | null> {
  const db = await getDb();
  const [row] = await db.select(mediaFields(locale)).from(s.mediaEntity).where(eq(s.mediaEntity.id, id));
  return row ?? null;
}
