import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { circle, log, mediaEntity, notification, pushSubscription, user } from "../../db/schema";
import type { AnyDb } from "./db-types";
import { asPushLocale, pushMessage, type PushLocale } from "./push";

/* The optional daily email for people who turned it on and who have no push on any device: what happened while they were away.
 * Sent by the Worker's second cron trigger (see worker.ts). Quiet by design: no email at all when there is nothing new. */

const DAY = 86_400_000;
export const DIGEST_MAX_ITEMS = 10;
/** Never reach further back than this, even for someone whose last digest was weeks ago. */
export const DIGEST_MAX_LOOKBACK_DAYS = 3;

export type DigestItem = { type: "log" | "comment" | "reaction" | "now_watching" | "serata_invite" | "circle_join"; actor: string | null; circle: string | null; title: string | null; at: Date };
export type Digest = { userId: string; email: string; name: string; locale: PushLocale; items: DigestItem[]; total: number };

/** Who should get a digest right now, with their unread notices since the last one (newest first, capped). */
export async function pendingDigests(db: AnyDb, now = new Date()): Promise<Digest[]> {
  const people = await db.select({ id: user.id, email: user.email, name: user.name, locale: user.locale, sentAt: user.digestSentAt })
    .from(user).where(and(eq(user.emailDigest, true), eq(user.isAnonymous, false)));
  if (people.length === 0) return [];

  const withPush = new Set((await db.select({ u: pushSubscription.userId }).from(pushSubscription).where(inArray(pushSubscription.userId, people.map((p) => p.id)))).map((r) => r.u));
  const out: Digest[] = [];
  for (const p of people) {
    if (withPush.has(p.id)) continue; // push already tells them
    const floor = now.getTime() - DIGEST_MAX_LOOKBACK_DAYS * DAY;
    const since = new Date(Math.max(p.sentAt?.getTime() ?? 0, floor));
    const rows = await db.select({
      type: notification.type, at: notification.createdAt, actor: user.name, circle: circle.name,
      logTitle: mediaEntity.originalTitle,
    }).from(notification)
      .leftJoin(user, eq(user.id, notification.actorId))
      .leftJoin(circle, eq(circle.id, notification.circleId))
      .leftJoin(log, eq(log.id, notification.logId))
      .leftJoin(mediaEntity, eq(mediaEntity.id, log.mediaId))
      .where(and(eq(notification.userId, p.id), isNull(notification.readAt), gt(notification.createdAt, since)))
      .orderBy(desc(notification.createdAt));
    if (rows.length === 0) continue;
    out.push({
      userId: p.id, email: p.email, name: p.name, locale: asPushLocale(p.locale), total: rows.length,
      items: rows.slice(0, DIGEST_MAX_ITEMS).map((r) => ({ type: r.type, actor: r.actor, circle: r.circle, title: r.logTitle, at: r.at })),
    });
  }
  return out;
}

export async function markDigestSent(db: AnyDb, userIds: string[], now = new Date()) {
  if (userIds.length) await db.update(user).set({ digestSentAt: now }).where(inArray(user.id, userIds));
}

/** One readable line per item, in the person's language (same wording as the push notifications). */
export function digestLines(d: Digest): string[] {
  return d.items.map((i) => {
    const m = pushMessage(i.type, d.locale, { name: i.actor ?? "Pausa", title: i.title, circle: i.circle });
    return i.circle && i.type !== "circle_join" ? `${m.title}: ${m.body}` : m.body;
  });
}
