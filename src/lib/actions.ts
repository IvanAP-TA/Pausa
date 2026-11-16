"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { atomically, getDb, schema as s } from "@/db";
import { requireUser } from "./session";
import { getCircleForMember, logVisibleTo, searchLocalMedia, type MediaSummary } from "./data";
import { searchTmdb } from "./tmdb";
import { REACTIONS } from "./reactions";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

/** Server actions have no locale context without a proxy: forms send it explicitly. */
function localeFrom(value: unknown): Locale {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/* ───────────── Cerchie ───────────── */

export async function createCircle(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(60).parse(formData.get("name"));
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(s.circle).values({ id, name, inviteCode: inviteCode(), createdBy: user.id });
  await db.insert(s.circleMember).values({ circleId: id, userId: user.id, role: "admin" });
  redirect(`/${localeFrom(formData.get("locale"))}/c/${id}`);
}

export async function joinCircle(formData: FormData) {
  const user = await requireUser();
  const code = z.string().trim().toUpperCase().min(4).max(16).parse(formData.get("code"));
  const db = await getDb();
  const [circle] = await db.select({ id: s.circle.id }).from(s.circle).where(eq(s.circle.inviteCode, code));
  const locale = localeFrom(formData.get("locale"));
  if (!circle) redirect(`/${locale}/join/${encodeURIComponent(code)}`);
  await db.insert(s.circleMember).values({ circleId: circle.id, userId: user.id }).onConflictDoNothing();
  const others = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
    .where(and(eq(s.circleMember.circleId, circle.id), ne(s.circleMember.userId, user.id)));
  if (others.length) {
    await db.insert(s.notification).values(others.map((o) => ({ userId: o.userId, type: "circle_join" as const, actorId: user.id, circleId: circle.id })));
  }
  redirect(`/${locale}/c/${circle.id}`);
}

/* ───────────── Diario ───────────── */

const logInput = z.object({
  circleId: z.string().min(1),
  mediaId: z.string().min(1),
  watchedOn: z.iso.date(),
  rating: z.coerce.number().int().min(0).max(10).transform((n) => (n === 0 ? null : n)),
  review: z.string().trim().max(4000).transform((v) => v || null),
  platform: z.string().trim().max(60).transform((v) => v || null),
  containsSpoilers: z.boolean(),
  isRewatch: z.boolean(),
  watchedWith: z.array(z.string()).max(20),
});

export async function createLog(formData: FormData) {
  const user = await requireUser();
  const input = logInput.parse({
    circleId: formData.get("circleId"),
    mediaId: formData.get("mediaId"),
    watchedOn: formData.get("watchedOn"),
    rating: formData.get("rating") ?? 0,
    review: formData.get("review") ?? "",
    platform: formData.get("platform") ?? "",
    containsSpoilers: formData.get("containsSpoilers") === "on",
    isRewatch: formData.get("isRewatch") === "on",
    watchedWith: formData.getAll("watchedWith").map(String),
  });

  const circle = await getCircleForMember(input.circleId, user.id);
  if (!circle) throw new Error("Not a member of this circle");

  const db = await getDb();
  // "Visto con" only accepts members of this Cerchia.
  const members = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
    .where(eq(s.circleMember.circleId, input.circleId));
  const memberIds = new Set(members.map((m) => m.userId));
  const watchedWith = input.watchedWith.filter((id) => id !== user.id && memberIds.has(id));

  const logId = crypto.randomUUID();
  const notify = [...memberIds].filter((id) => id !== user.id);
  await atomically([
    db.insert(s.log).values({
      id: logId, userId: user.id, mediaId: input.mediaId, watchedOn: input.watchedOn, rating: input.rating,
      review: input.review, platform: input.platform, containsSpoilers: input.containsSpoilers, isRewatch: input.isRewatch,
    }),
    watchedWith.length > 0 && db.insert(s.logWatchedWith).values(watchedWith.map((userId) => ({ logId, userId }))),
    notify.length > 0 && db.insert(s.notification).values(notify.map((userId) => ({ userId, type: "log" as const, actorId: user.id, circleId: input.circleId, logId }))),
    // Logging a title you were "watching" clears the status.
    db.delete(s.nowWatching).where(and(eq(s.nowWatching.userId, user.id), eq(s.nowWatching.mediaId, input.mediaId))),
  ]);

  redirect(`/${localeFrom(formData.get("locale"))}/c/${input.circleId}`);
}

export async function toggleReaction(logId: string, emoji: string) {
  const user = await requireUser();
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw new Error("Unknown reaction");
  const db = await getDb();

  const row = await logVisibleTo(logId, user.id);
  if (!row) throw new Error("Not allowed");

  const where = and(eq(s.reaction.logId, logId), eq(s.reaction.userId, user.id), eq(s.reaction.emoji, emoji));
  const [existing] = await db.select().from(s.reaction).where(where);
  if (existing) await db.delete(s.reaction).where(where);
  else {
    await db.insert(s.reaction).values({ logId, userId: user.id, emoji });
    if (row.authorId !== user.id) {
      await db.insert(s.notification).values({ userId: row.authorId, type: "reaction", actorId: user.id, logId });
    }
  }

  revalidatePath(`/[locale]/c/[circleId]`, "page");
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Media ───────────── */

export async function searchMedia(query: string, localeParam: string): Promise<MediaSummary[]> {
  await requireUser();
  const q = z.string().trim().min(1).max(100).safeParse(query);
  if (!q.success) return [];
  const locale = localeFrom(localeParam);
  const [local, remote] = await Promise.all([searchLocalMedia(q.data, locale), searchTmdb(q.data, locale)]);
  const seen = new Set<string>();
  return [...local, ...remote].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).slice(0, 12);
}

/* ───────────── Liste ───────────── */

export async function createList(formData: FormData) {
  const user = await requireUser();
  const circleId = z.string().min(1).parse(formData.get("circleId"));
  const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
  const kind = z.enum(["watchlist", "list", "ranking"]).catch("list").parse(formData.get("kind"));
  const personal = formData.get("scope") === "personal";
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");
  const db = await getDb();
  await db.insert(s.list).values({ circleId: personal ? null : circleId, ownerId: user.id, name, kind });
  revalidatePath(`/[locale]/c/[circleId]/lists`, "page");
}

/** Adds a title to a group list (member of its Cerchia) or to one of your personal lists. */
export async function addToList(formData: FormData) {
  const user = await requireUser();
  const listId = z.string().min(1).parse(formData.get("listId"));
  const mediaId = z.string().min(1).parse(formData.get("mediaId"));
  const db = await getDb();
  const [list] = await db.select({ circleId: s.list.circleId, ownerId: s.list.ownerId }).from(s.list).where(eq(s.list.id, listId));
  if (!list) throw new Error("List not found");
  const allowed = list.circleId ? await getCircleForMember(list.circleId, user.id) : list.ownerId === user.id;
  if (!allowed) throw new Error("Not allowed");
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${s.listItem.position}) + 1, 0)` }).from(s.listItem).where(eq(s.listItem.listId, listId));
  await db.insert(s.listItem).values({ listId, mediaId, position: next, addedBy: user.id }).onConflictDoNothing();
  revalidatePath(`/[locale]/c/[circleId]/lists`, "page");
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Commenti ───────────── */

export async function addComment(formData: FormData) {
  const user = await requireUser();
  const logId = z.string().min(1).parse(formData.get("logId"));
  const body = z.string().trim().min(1).max(2000).parse(formData.get("body"));
  const isSpoiler = formData.get("isSpoiler") === "on";
  const circleHint = formData.get("circleId");
  const row = await logVisibleTo(logId, user.id);
  if (!row) throw new Error("Not allowed");

  const db = await getDb();
  // Notify the author and everyone already in the thread, except the commenter.
  const thread = await db.selectDistinct({ userId: s.comment.userId }).from(s.comment).where(eq(s.comment.logId, logId));
  const notify = new Set([row.authorId, ...thread.map((t) => t.userId)]);
  notify.delete(user.id);
  // circleId is only a hint for where the notification links; access is still checked on the thread page.
  const circleId = typeof circleHint === "string" && (await getCircleForMember(circleHint, user.id)) ? circleHint : null;
  await atomically([
    db.insert(s.comment).values({ logId, userId: user.id, body, isSpoiler }),
    notify.size > 0 && db.insert(s.notification).values([...notify].map((userId) => ({ userId, type: "comment" as const, actorId: user.id, logId, circleId }))),
  ]);
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Sto guardando ───────────── */

export async function setNowWatching(formData: FormData) {
  const user = await requireUser();
  const circleId = z.string().min(1).parse(formData.get("circleId"));
  const mediaId = z.string().min(1).parse(formData.get("mediaId"));
  const progress = z.string().trim().max(20).transform((v) => v || null).parse(formData.get("progress") ?? "");
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");

  const db = await getDb();
  const [current] = await db.select({ mediaId: s.nowWatching.mediaId }).from(s.nowWatching).where(eq(s.nowWatching.userId, user.id));
  await db.insert(s.nowWatching).values({ userId: user.id, mediaId, progress, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.nowWatching.userId, set: { mediaId, progress, updatedAt: new Date() } });

  // Notify the Cerchia only when starting a new title, not on every episode bump.
  if (current?.mediaId !== mediaId) {
    const others = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
      .where(and(eq(s.circleMember.circleId, circleId), ne(s.circleMember.userId, user.id)));
    if (others.length) {
      await db.insert(s.notification).values(others.map((o) => ({ userId: o.userId, type: "now_watching" as const, actorId: user.id, circleId })));
    }
  }
  redirect(`/${localeFrom(formData.get("locale"))}/c/${circleId}`);
}

export async function clearNowWatching() {
  const user = await requireUser();
  const db = await getDb();
  await db.delete(s.nowWatching).where(eq(s.nowWatching.userId, user.id));
  revalidatePath(`/[locale]/c/[circleId]`, "page");
}

/* ───────────── Notifiche ───────────── */

export async function markNotificationsRead() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(s.notification).set({ readAt: new Date() })
    .where(and(eq(s.notification.userId, user.id), sql`${s.notification.readAt} is null`));
}
