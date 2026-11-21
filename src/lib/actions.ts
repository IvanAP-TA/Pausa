"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { atomically, getDb, schema as s } from "@/db";
import { requireUser } from "./session";
import { pushNotifications } from "./push";
import { allow, enforce } from "./limit-guard";
import { filterRecipients } from "./core/settings";
import { clampPosition, getEpisodeInfo } from "./core/episodes";
import { ensureEpisodeLimits } from "./episode-info";
import { searchAnime } from "./anilist";
import { getCircleForMember, logVisibleTo, searchLocalMedia, type MediaSummary } from "./data";
import { searchTmdb } from "./tmdb";
import { MAX_EPISODE, MAX_SEASON, nextEpisode, nextSeason, setWatching, toPosition } from "./core/progress";
import { REACTIONS } from "./reactions";
import { saveUserOverview } from "./media-detail";
import {
  EXPIRY_CHOICES, MAX_USES_CHOICES, createCircleWithInvite, createInvite, leaveCircle, redeemInvite, removeMember,
  revokeInvite, setMemberRole,
} from "./core/circles";

/** Server actions have no locale context without a proxy: forms send it explicitly. */
function localeFrom(value: unknown): Locale {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/* ───────────── Cerchie ───────────── */

export async function createCircle(formData: FormData) {
  const user = await requireUser();
  await enforce("createCircle", user.id);
  const name = z.string().trim().min(1).max(60).parse(formData.get("name"));
  const db = await getDb();
  const { id } = await createCircleWithInvite(db, { name, createdBy: user.id });
  redirect(`/${localeFrom(formData.get("locale"))}/c/${id}`);
}

export async function joinCircle(formData: FormData) {
  const user = await requireUser();
  await enforce("joinCircle", user.id);
  const locale = localeFrom(formData.get("locale"));
  // People paste the whole invite link as often as the code: the code is its last piece.
  const typed = String(formData.get("code") ?? "").trim().split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  const code = typed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  if (code.length < 4) redirect(`/${locale}/join/${code || "-"}`); // the join page says the invite does not exist
  const db = await getDb();
  const res = await redeemInvite(db, user.id, code);
  // Unknown / expired / revoked / used-up: the join page explains which.
  if ("error" in res) redirect(`/${locale}/join/${encodeURIComponent(code)}`);
  if (!res.already) {
    const others = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
      .where(and(eq(s.circleMember.circleId, res.circleId), ne(s.circleMember.userId, user.id)));
    const recipients = await filterRecipients(db, others.map((o) => o.userId), { type: "circle_join", circleId: res.circleId });
    if (recipients.length) {
      const rows = recipients.map((userId) => ({ userId, type: "circle_join" as const, actorId: user.id, circleId: res.circleId }));
      await db.insert(s.notification).values(rows);
      pushNotifications(rows);
    }
  }
  redirect(`/${locale}/c/${res.circleId}`);
}

/* ───────────── Cerchie: inviti e ruoli ───────────── */

const circleFields = z.object({ circleId: z.string().min(1), locale: z.string().optional() });

function backToMembers(formData: FormData, circleId: string, error?: string): never {
  const locale = localeFrom(formData.get("locale"));
  redirect(`/${locale}/c/${circleId}/members${error ? `?e=${error}` : ""}`);
}

export async function createInviteAction(formData: FormData) {
  const user = await requireUser();
  await enforce("createInvite", user.id);
  const { circleId } = circleFields.parse({ circleId: formData.get("circleId") });
  const expiry = z.enum(Object.keys(EXPIRY_CHOICES) as [keyof typeof EXPIRY_CHOICES, ...(keyof typeof EXPIRY_CHOICES)[]]).parse(formData.get("expiry"));
  const rawUses = String(formData.get("maxUses") ?? "");
  const maxUses = rawUses === "" ? null : z.coerce.number().refine((n) => (MAX_USES_CHOICES as readonly number[]).includes(n)).parse(rawUses);
  const db = await getDb();
  const [me] = await db.select({ role: s.circleMember.role }).from(s.circleMember)
    .where(and(eq(s.circleMember.circleId, circleId), eq(s.circleMember.userId, user.id)));
  if (me?.role !== "admin") backToMembers(formData, circleId, "forbidden");
  await createInvite(db, { circleId, createdBy: user.id, expiresInMs: EXPIRY_CHOICES[expiry], maxUses });
  revalidatePath("/[locale]/c/[circleId]/members", "page");
  backToMembers(formData, circleId);
}

export async function revokeInviteAction(formData: FormData) {
  const user = await requireUser();
  const { circleId } = circleFields.parse({ circleId: formData.get("circleId") });
  const inviteId = z.string().min(1).parse(formData.get("inviteId"));
  const res = await revokeInvite(await getDb(), { inviteId, circleId, actorId: user.id });
  revalidatePath("/[locale]/c/[circleId]/members", "page");
  backToMembers(formData, circleId, "error" in res ? res.error : undefined);
}

export async function setMemberRoleAction(formData: FormData) {
  const user = await requireUser();
  const { circleId } = circleFields.parse({ circleId: formData.get("circleId") });
  const targetId = z.string().min(1).parse(formData.get("targetId"));
  const role = z.enum(["admin", "member"]).parse(formData.get("role"));
  const res = await setMemberRole(await getDb(), { circleId, actorId: user.id, targetId, role });
  revalidatePath("/[locale]/c/[circleId]/members", "page");
  backToMembers(formData, circleId, "error" in res ? res.error : undefined);
}

export async function removeMemberAction(formData: FormData) {
  const user = await requireUser();
  const { circleId } = circleFields.parse({ circleId: formData.get("circleId") });
  const targetId = z.string().min(1).parse(formData.get("targetId"));
  const res = await removeMember(await getDb(), { circleId, actorId: user.id, targetId });
  revalidatePath("/[locale]/c/[circleId]/members", "page");
  backToMembers(formData, circleId, "error" in res ? res.error : undefined);
}

export async function leaveCircleAction(formData: FormData) {
  const user = await requireUser();
  const { circleId } = circleFields.parse({ circleId: formData.get("circleId") });
  const res = await leaveCircle(await getDb(), { circleId, userId: user.id });
  if ("error" in res) backToMembers(formData, circleId, res.error);
  redirect(`/${localeFrom(formData.get("locale"))}/home`);
}

/* ───────────── Diario ───────────── */

const logInput = z.object({
  circleId: z.string().min(1),
  mediaId: z.string().min(1),
  watchedOn: z.iso.date(),
  rating: z.coerce.number().int().min(0).max(10).transform((n) => (n === 0 ? null : n)),
  review: z.string().trim().max(4000).transform((v) => v || null),
  platform: z.string().trim().max(60).transform((v) => v || null),
  season: z.number().int().min(1).max(MAX_SEASON).nullable(),
  episode: z.number().int().min(1).max(MAX_EPISODE).nullable(),
  containsSpoilers: z.boolean(),
  isRewatch: z.boolean(),
  watchedWith: z.array(z.string()).max(20),
  /** Only in my personal space: no Cerchia sees it until I share it. */
  isPrivate: z.boolean(),
  /** A synopsis written by hand, for a title no catalogue described. */
  overview: z.string().trim().max(1200),
});

export async function createLog(formData: FormData) {
  const user = await requireUser();
  await enforce("createLog", user.id);
  const input = logInput.parse({
    circleId: formData.get("circleId"),
    mediaId: formData.get("mediaId"),
    watchedOn: formData.get("watchedOn"),
    rating: formData.get("rating") ?? 0,
    review: formData.get("review") ?? "",
    platform: formData.get("platform") ?? "",
    season: toPosition(formData.get("season"), MAX_SEASON),
    episode: toPosition(formData.get("logEpisode"), MAX_EPISODE),
    containsSpoilers: formData.get("containsSpoilers") === "on",
    isRewatch: formData.get("isRewatch") === "on",
    watchedWith: formData.getAll("watchedWith").map(String),
    isPrivate: formData.get("isPrivate") === "on",
    overview: formData.get("overview") ?? "",
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
  // An episode log cannot name an episode that does not exist (when the counts are known).
  const pos = clampPosition(await getEpisodeInfo(db, input.mediaId), { season: input.season, episode: input.episode });
  // A private log tells nobody.
  const notify = input.isPrivate ? [] : await filterRecipients(db, [...memberIds].filter((id) => id !== user.id), { type: "log", circleId: input.circleId });
  await atomically([
    db.insert(s.log).values({
      id: logId, userId: user.id, mediaId: input.mediaId, watchedOn: input.watchedOn, rating: input.rating,
      review: input.review, platform: input.platform, season: pos.season, episode: pos.episode, containsSpoilers: input.containsSpoilers, isRewatch: input.isRewatch,
      scope: input.isPrivate ? "private" : "circles",
    }),
    watchedWith.length > 0 && db.insert(s.logWatchedWith).values(watchedWith.map((userId) => ({ logId, userId }))),
    notify.length > 0 && db.insert(s.notification).values(notify.map((userId) => ({ userId, type: "log" as const, actorId: user.id, circleId: input.circleId, logId }))),
    // Logging a title you were "watching" clears the status.
    db.delete(s.nowWatching).where(and(eq(s.nowWatching.userId, user.id), eq(s.nowWatching.mediaId, input.mediaId))),
  ]);
  pushNotifications(notify.map((userId) => ({ userId, type: "log" as const, actorId: user.id, circleId: input.circleId, logId })));
  if (input.overview) await saveUserOverview(input.mediaId, localeFrom(formData.get("locale")), input.overview);

  const locale = localeFrom(formData.get("locale"));
  redirect(input.isPrivate ? `/${locale}/me/diary?ok=logged#l-${logId}` : `/${locale}/c/${input.circleId}`);
}

export async function toggleReaction(logId: string, emoji: string) {
  const user = await requireUser();
  await enforce("react", user.id);
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
      const [to] = await filterRecipients(db, [row.authorId], { type: "reaction" });
      if (to) {
        await db.insert(s.notification).values({ userId: to, type: "reaction", actorId: user.id, logId });
        pushNotifications([{ userId: to, type: "reaction", actorId: user.id, logId }]);
      }
    }
  }

  revalidatePath(`/[locale]/c/[circleId]`, "page");
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Media ───────────── */

/** For the forms: how many seasons and episodes a series has, when we know. Looked up at most once a month per title. */
export async function getEpisodeLimits(mediaId: string) {
  await requireUser();
  return ensureEpisodeLimits(z.string().min(1).max(64).parse(mediaId));
}

export async function searchMedia(query: string, localeParam: string): Promise<MediaSummary[]> {
  const user = await requireUser();
  if (!(await allow("search", user.id))) return [];
  const q = z.string().trim().min(1).max(100).safeParse(query);
  if (!q.success) return [];
  const locale = localeFrom(localeParam);
  const [local, remote, anime] = await Promise.all([searchLocalMedia(q.data, locale), searchTmdb(q.data, locale), searchAnime(q.data, locale)]);
  const seen = new Set<string>();
  // The same anime can come from TMDB and from AniList: keep TMDB's (it has streaming data) and add only the ones it lacks.
  const key = (m: MediaSummary) => `${m.title.toLowerCase()}|${m.year ?? ""}`;
  const have = new Set([...local, ...remote].map(key));
  const extra = anime.filter((m) => !have.has(key(m)));
  return [...local, ...remote, ...extra].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).slice(0, 14);
}

/* ───────────── Liste ───────────── */

/** A group list (from a Cerchia, its members only) or a personal one (from the profile: no Cerchia at all). */
export async function createList(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
  const kind = z.enum(["watchlist", "list", "ranking"]).catch("list").parse(formData.get("kind"));
  const personal = formData.get("scope") === "personal";
  const db = await getDb();
  if (personal) {
    await db.insert(s.list).values({ circleId: null, ownerId: user.id, name, kind });
    revalidatePath("/[locale]/me/lists", "page");
    return;
  }
  const circleId = z.string().min(1).parse(formData.get("circleId"));
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");
  await db.insert(s.list).values({ circleId, ownerId: user.id, name, kind });
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
  revalidatePath("/[locale]/me/lists", "page");
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Commenti ───────────── */

export async function addComment(formData: FormData) {
  const user = await requireUser();
  await enforce("comment", user.id);
  const logId = z.string().min(1).parse(formData.get("logId"));
  const body = z.string().trim().min(1).max(2000).parse(formData.get("body"));
  const isSpoiler = formData.get("isSpoiler") === "on";
  const circleHint = formData.get("circleId");
  const row = await logVisibleTo(logId, user.id);
  if (!row) throw new Error("Not allowed");

  const db = await getDb();
  // Notify the author and everyone already in the thread, except the commenter.
  const thread = await db.selectDistinct({ userId: s.comment.userId }).from(s.comment).where(eq(s.comment.logId, logId));
  const wanted = new Set([row.authorId, ...thread.map((t) => t.userId)]);
  wanted.delete(user.id);
  // circleId is only a hint for where the notification links; access is still checked on the thread page.
  const circleId = typeof circleHint === "string" && (await getCircleForMember(circleHint, user.id)) ? circleHint : null;
  const notify = await filterRecipients(db, [...wanted], { type: "comment", circleId });
  await atomically([
    db.insert(s.comment).values({ logId, userId: user.id, body, isSpoiler }),
    notify.length > 0 && db.insert(s.notification).values(notify.map((userId) => ({ userId, type: "comment" as const, actorId: user.id, logId, circleId }))),
  ]);
  pushNotifications(notify.map((userId) => ({ userId, type: "comment" as const, actorId: user.id, logId, circleId })));
  revalidatePath(`/[locale]/c/[circleId]/l/[logId]`, "page");
}

/* ───────────── Sto guardando ───────────── */

export async function setNowWatching(formData: FormData) {
  const user = await requireUser();
  const circleId = z.string().min(1).parse(formData.get("circleId"));
  const mediaId = z.string().min(1).parse(formData.get("mediaId"));
  const season = toPosition(formData.get("season"), MAX_SEASON);
  const episode = toPosition(formData.get("episode"), MAX_EPISODE);
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");

  const db = await getDb();
  const pos = clampPosition(await getEpisodeInfo(db, mediaId), { season, episode });
  const { titleChanged } = await setWatching(db, { userId: user.id, mediaId, season: pos.season, episode: pos.episode });

  // Notify the Cerchia only when starting a new title, not on every episode bump.
  if (titleChanged) {
    const others = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
      .where(and(eq(s.circleMember.circleId, circleId), ne(s.circleMember.userId, user.id)));
    const recipients = await filterRecipients(db, others.map((o) => o.userId), { type: "now_watching", circleId });
    if (recipients.length) {
      const rows = recipients.map((userId) => ({ userId, type: "now_watching" as const, actorId: user.id, circleId, mediaId }));
      await db.insert(s.notification).values(rows);
      pushNotifications(rows);
    }
  }
  redirect(`/${localeFrom(formData.get("locale"))}/c/${circleId}`);
}

/** One tap on the feed: next episode, or the start of the next season. */
export async function advanceWatching(formData: FormData) {
  const user = await requireUser();
  const db = await getDb();
  if (formData.get("what") === "season") await nextSeason(db, user.id);
  else await nextEpisode(db, user.id);
  revalidatePath("/[locale]/c/[circleId]", "page");
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
