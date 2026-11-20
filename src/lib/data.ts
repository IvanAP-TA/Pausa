import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { isCover, type CircleSettings } from "@/lib/core/settings";
import { arrivedIn, visibleIn } from "@/lib/core/visibility";

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

/**
 * The circle and what the viewer's membership says about it (role, mute, live-watching switches, profile), in ONE query shared by
 * everything on the page (layout, feed, members): D1 charges a round trip per query, so asking once is the cheapest speed-up.
 */
const getCircleContext = cache(async (circleId: string, userId: string) => {
  const db = await getDb();
  const [row] = await db
    .select({
      id: s.circle.id, name: s.circle.name, role: s.circleMember.role,
      liveWatching: s.circle.liveWatching, description: s.circle.description, cover: s.circle.cover,
      muted: s.circleMember.muted, hideWatching: s.circleMember.hideWatching,
    })
    .from(s.circle)
    .innerJoin(s.circleMember, and(eq(s.circleMember.circleId, s.circle.id), eq(s.circleMember.userId, userId)))
    .where(eq(s.circle.id, circleId));
  return row ?? null;
});

/** Returns the circle only if the user is a member. Every circle read goes through this. */
export const getCircleForMember = cache(async (circleId: string, userId: string) => {
  const c = await getCircleContext(circleId, userId);
  return c ? { id: c.id, name: c.name, role: c.role } : null;
});

/** The viewer's settings for this Cerchia (same single query as getCircleForMember). */
export const getMyCircleSettings = cache(async (circleId: string, userId: string): Promise<CircleSettings | null> => {
  const c = await getCircleContext(circleId, userId);
  return c ? { liveWatching: c.liveWatching, description: c.description, cover: isCover(c.cover) ? c.cover : null, muted: c.muted, hideWatching: c.hideWatching, role: c.role } : null;
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
    .where(and(like(s.log.watchedOn, `${year}-%`), visibleIn(circleId)));
  return { logsThisYear: row?.logs ?? 0 };
}

/* ───────────── Feed ───────────── */

/** What the feed can be narrowed by (all optional, all combinable). */
export type FeedFilters = { q?: string; kind?: "movie" | "tv" | "anime"; by?: string; with?: string; year?: number; minRating?: number; mediaId?: string };

export async function getCircleFeed(circleId: string, viewerId: string, locale: string, limit = 30, logId?: string, before?: Date, filters: FeedFilters = {}) {
  const db = await getDb();
  const q = filters.q?.trim().toLowerCase().replace(/[%_\\]/g, (c) => "\\" + c);
  const narrow = and(
    filters.by ? eq(s.log.userId, filters.by) : undefined,
    filters.mediaId ? eq(s.log.mediaId, filters.mediaId) : undefined,
    filters.with ? sql`exists (select 1 from ${s.logWatchedWith} where ${s.logWatchedWith.logId} = ${s.log.id} and ${s.logWatchedWith.userId} = ${filters.with})` : undefined,
    filters.kind ? eq(s.mediaEntity.kind, filters.kind) : undefined,
    filters.year ? like(s.log.watchedOn, `${filters.year}-%`) : undefined,
    filters.minRating ? sql`${s.log.rating} >= ${filters.minRating}` : undefined,
    // Title: the localized one or the original, any part of it, any case.
    q ? sql`(lower(${titleFor(locale)}) like ${"%" + q + "%"} escape '\\' or lower(${s.mediaEntity.originalTitle}) like ${"%" + q + "%"} escape '\\')` : undefined,
  );
  // A private log shared with this Cerchia arrives when it is shared, not when it was watched years ago.
  const at = arrivedIn(circleId);
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
      createdAt: at.mapWith(s.log.createdAt),
      author: { id: s.user.id, name: s.user.name, image: s.user.image },
      media: mediaFields(locale),
      runtimeMin: s.mediaEntity.runtimeMin,
    })
    .from(s.log)
    .innerJoin(s.circleMember, and(eq(s.circleMember.userId, s.log.userId), eq(s.circleMember.circleId, circleId)))
    .innerJoin(s.user, eq(s.user.id, s.log.userId))
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.log.mediaId))
    .where(and(visibleIn(circleId), logId ? eq(s.log.id, logId) : undefined, before ? sql`${at} < ${before.getTime()}` : undefined, narrow))
    .orderBy(desc(at))
    .limit(limit);

  const ids = logs.map((l) => l.id);
  if (ids.length === 0) return [];

  const mediaIds = [...new Set(logs.map((l) => l.media.id))];
  // One D1 batch: four small reads, one round trip.
  const [withRows, reactionRows, commentRows, aboutRows] = await db.batch([
    db.select({ logId: s.logWatchedWith.logId, id: s.user.id, name: s.user.name })
      .from(s.logWatchedWith).innerJoin(s.user, eq(s.user.id, s.logWatchedWith.userId))
      .where(inArray(s.logWatchedWith.logId, ids)),
    db.select({ logId: s.reaction.logId, emoji: s.reaction.emoji, userId: s.reaction.userId })
      .from(s.reaction).where(inArray(s.reaction.logId, ids)),
    // Every comment of these logs, oldest first: the count and the latest one (shown under the log) come from the same read.
    db.select({ logId: s.comment.logId, body: s.comment.body, isSpoiler: s.comment.isSpoiler, author: { id: s.user.id, name: s.user.name, image: s.user.image } })
      .from(s.comment).innerJoin(s.user, eq(s.user.id, s.comment.userId))
      .where(inArray(s.comment.logId, ids)).orderBy(asc(s.comment.createdAt)),
    // What each title is about (genres, synopsis), when someone already looked it up: the diary says a little more than the name.
    db.select({ mediaId: s.mediaDetail.mediaId, genres: s.mediaDetail.genres, overview: s.mediaDetail.overview })
      .from(s.mediaDetail).where(and(inArray(s.mediaDetail.mediaId, mediaIds), eq(s.mediaDetail.locale, locale))),
  ]);
  const aboutOf = new Map(aboutRows.map((a) => [a.mediaId, a]));

  return logs.map((l) => {
    const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of reactionRows) {
      if (r.logId !== l.id) continue;
      const c = counts.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
      c.count += 1;
      if (r.userId === viewerId) c.mine = true;
      counts.set(r.emoji, c);
    }
    const thread = commentRows.filter((c) => c.logId === l.id);
    const last = thread.at(-1);
    return {
      ...l,
      watchedWith: withRows.filter((w) => w.logId === l.id).map(({ id, name }) => ({ id, name })),
      reactions: [...counts.values()],
      commentCount: thread.length,
      lastComment: last ? { body: last.body, isSpoiler: last.isSpoiler, author: last.author } : null,
      about: { genres: aboutOf.get(l.media.id)?.genres ?? [], overview: aboutOf.get(l.media.id)?.overview ?? null, runtimeMin: l.runtimeMin },
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

/** Author id if the log shows in at least one Cerchia the viewer belongs to (or is the viewer's own), else null. */
export async function logVisibleTo(logId: string, viewerId: string) {
  const db = await getDb();
  const [found] = await db.select({ authorId: s.log.userId, mediaId: s.log.mediaId, scope: s.log.scope }).from(s.log).where(eq(s.log.id, logId));
  if (!found) return null;
  const row = { authorId: found.authorId, mediaId: found.mediaId };
  if (row.authorId === viewerId) return row;
  const viewerCircles = db.select({ id: s.circleMember.circleId }).from(s.circleMember).where(eq(s.circleMember.userId, viewerId));
  const [shared] = await db.select({ c: s.circleMember.circleId }).from(s.circleMember)
    .where(and(
      eq(s.circleMember.userId, row.authorId), inArray(s.circleMember.circleId, viewerCircles),
      found.scope === "circles" ? undefined : inArray(s.circleMember.circleId, db.select({ id: s.logShare.circleId }).from(s.logShare).where(eq(s.logShare.logId, logId))),
    )).limit(1);
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
  const me = await getMyCircleSettings(circleId, viewerId); // already fetched by the layout: no query here
  if (!me?.liveWatching || me.hideWatching) return [];
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

/** A title with what its page needs beyond the summary: the original name and how long it runs. */
export async function getMediaPage(id: string, locale: string) {
  const db = await getDb();
  const [row] = await db.select({ ...mediaFields(locale), originalTitle: s.mediaEntity.originalTitle, runtimeMin: s.mediaEntity.runtimeMin })
    .from(s.mediaEntity).where(eq(s.mediaEntity.id, id));
  return row ?? null;
}

export async function getMedia(id: string, locale: string): Promise<MediaSummary | null> {
  const db = await getDb();
  const [row] = await db.select(mediaFields(locale)).from(s.mediaEntity).where(eq(s.mediaEntity.id, id));
  return row ?? null;
}

/* ───────────── Spazio personale ───────────── */

/** Everything the person logged, newest viewing first, with who can read each one. Only its author ever calls this. */
export async function getMyDiary(userId: string, locale: string, limit = 40, before?: string, only?: "private" | "circles") {
  const db = await getDb();
  const logs = await db
    .select({
      id: s.log.id, watchedOn: s.log.watchedOn, rating: s.log.rating, review: s.log.review, scope: s.log.scope,
      season: s.log.season, episode: s.log.episode, isRewatch: s.log.isRewatch, media: mediaFields(locale),
    })
    .from(s.log)
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.log.mediaId))
    .where(and(eq(s.log.userId, userId), before ? sql`(${s.log.watchedOn} || ${s.log.id}) < ${before}` : undefined, only ? eq(s.log.scope, only) : undefined))
    .orderBy(desc(s.log.watchedOn), desc(s.log.id))
    .limit(limit);
  if (logs.length === 0) return [];
  const shares = await db.select({ logId: s.logShare.logId, circleId: s.logShare.circleId }).from(s.logShare)
    .where(inArray(s.logShare.logId, logs.map((l) => l.id)));
  return logs.map((l) => ({ ...l, sharedWith: shares.filter((x) => x.logId === l.id).map((x) => x.circleId) }));
}

export type MyLog = Awaited<ReturnType<typeof getMyDiary>>[number];

export async function getMyDiaryCounts(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ all: sql<number>`count(*)`, priv: sql<number>`coalesce(sum(case when ${s.log.scope} = 'private' then 1 else 0 end), 0)` })
    .from(s.log).where(eq(s.log.userId, userId));
  return { all: row?.all ?? 0, private: row?.priv ?? 0 };
}
