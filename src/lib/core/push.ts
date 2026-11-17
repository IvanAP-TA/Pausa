import { createTranslator } from "next-intl";
import { eq, inArray } from "drizzle-orm";
import { pushSubscription } from "../../db/schema";
import type { AnyDb } from "./db-types";
import it from "../../../messages/it.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

/* Web Push: who is subscribed, and what a notification says. Sending lives in lib/push.ts (it needs the VAPID keys and the network). */

const MESSAGES = { it, en, es } as const;
export type PushLocale = keyof typeof MESSAGES;
export const asPushLocale = (v: unknown): PushLocale => (v === "en" || v === "es" ? v : "it");

export type PushKind = "log" | "comment" | "reaction" | "now_watching" | "serata_invite" | "circle_join";

export type PushVars = { name: string; title?: string | null; circle?: string | null };

/** The notification text, in the subscriber's language. The title is the Cerchia name when known, else "Pausa". */
export function pushMessage(kind: PushKind, locale: PushLocale, v: PushVars) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "push" });
  return {
    title: v.circle || "Pausa",
    body: t(kind, { name: v.name, title: v.title ?? "", circle: v.circle ?? "" }),
  };
}

/** Where tapping the notification goes: the Serata if it is an invite, the log if there is one, else the Cerchia, else the app's entry (which opens the last Cerchia). */
export function pushUrl(locale: PushLocale, ids: { circleId?: string | null; logId?: string | null; serataCode?: string | null }) {
  if (ids.serataCode) return `/${locale}/s/${ids.serataCode}`;
  if (ids.circleId && ids.logId) return `/${locale}/c/${ids.circleId}/l/${ids.logId}`;
  if (ids.circleId) return `/${locale}/c/${ids.circleId}`;
  return `/${locale}`;
}

/** One row per browser. A browser that moves to another account is reassigned, never duplicated. */
export async function saveSubscription(db: AnyDb, input: { userId: string; endpoint: string; p256dh: string; auth: string; locale: string }) {
  const locale = asPushLocale(input.locale);
  await db.insert(pushSubscription).values({ userId: input.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, locale })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId: input.userId, p256dh: input.p256dh, auth: input.auth, locale } });
}

export async function removeSubscription(db: AnyDb, endpoint: string) {
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
}

export async function subscriptionsFor(db: AnyDb, userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(pushSubscription).where(inArray(pushSubscription.userId, userIds));
}
