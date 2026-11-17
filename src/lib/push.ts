import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { getDb, schema as s } from "@/db";
import { asPushLocale, pushMessage, pushUrl, removeSubscription, subscriptionsFor, type PushKind } from "./core/push";

/* Sending Web Push (RFC 8291, VAPID) with WebCrypto, so it runs on Workers. Best effort: a failed push never fails the action
 * that caused it, and a subscription the push service says is gone (404/410) is deleted. */

export const pushEnabled = () => Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

export type PushEvent = { userId: string; type: PushKind; actorId?: string | null; circleId?: string | null; logId?: string | null; mediaId?: string | null; serataCode?: string | null };

const vapid = () => ({
  subject: process.env.VAPID_SUBJECT ?? "https://pausa.gnagno.org",
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
});

const uniq = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))];

async function deliver(events: PushEvent[]) {
  const db = await getDb();
  const subs = await subscriptionsFor(db, uniq(events.map((e) => e.userId)));
  if (subs.length === 0) return; // the common case: one cheap query and done

  const actorIds = uniq(events.map((e) => e.actorId));
  const circleIds = uniq(events.map((e) => e.circleId));
  const logIds = uniq(events.map((e) => e.logId));
  const mediaIds = uniq(events.map((e) => e.mediaId));
  const [actors, circles, logTitles, mediaTitles] = await Promise.all([
    actorIds.length ? db.select({ id: s.user.id, name: s.user.name }).from(s.user).where(inArray(s.user.id, actorIds)) : [],
    circleIds.length ? db.select({ id: s.circle.id, name: s.circle.name }).from(s.circle).where(inArray(s.circle.id, circleIds)) : [],
    logIds.length
      ? db.select({ id: s.log.id, title: s.mediaEntity.originalTitle }).from(s.log).innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.log.mediaId)).where(inArray(s.log.id, logIds))
      : [],
    mediaIds.length ? db.select({ id: s.mediaEntity.id, title: s.mediaEntity.originalTitle }).from(s.mediaEntity).where(inArray(s.mediaEntity.id, mediaIds)) : [],
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  const circleName = new Map(circles.map((c) => [c.id, c.name]));
  const logTitle = new Map(logTitles.map((l) => [l.id, l.title]));
  const mediaTitle = new Map(mediaTitles.map((m) => [m.id, m.title]));

  await Promise.allSettled(events.flatMap((e) => subs.filter((sub) => sub.userId === e.userId).map(async (sub) => {
    const locale = asPushLocale(sub.locale);
    const msg = pushMessage(e.type, locale, {
      name: (e.actorId && actorName.get(e.actorId)) || "Pausa",
      title: (e.logId && logTitle.get(e.logId)) || (e.mediaId && mediaTitle.get(e.mediaId)) || "",
      circle: e.circleId ? circleName.get(e.circleId) : null,
    });
    const payload = await buildPushPayload(
      { data: { ...msg, url: pushUrl(locale, e), tag: e.logId ?? e.type }, options: { ttl: 60 * 60 * 24, urgency: "normal" } },
      { endpoint: sub.endpoint, expirationTime: null, keys: { auth: sub.auth, p256dh: sub.p256dh } },
      vapid(),
    );
    const res = await fetch(sub.endpoint, { method: payload.method, headers: payload.headers, body: payload.body });
    if (res.status === 404 || res.status === 410) await removeSubscription(db, sub.endpoint);
  })));
}

/** Fire-and-forget after the notification rows are written. On Workers it keeps running after the response (waitUntil). */
export function pushNotifications(events: PushEvent[]) {
  if (!pushEnabled() || events.length === 0) return;
  const job = deliver(events).catch((err) => console.error("[pausa] push failed", err));
  try {
    getCloudflareContext().ctx.waitUntil(job);
  } catch {
    // no request context (tests, scripts): the promise still runs, we just do not hold the response for it
  }
}
