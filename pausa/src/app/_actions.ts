"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { env } from "@/env";
import { getDb } from "@/db";
import { requireUser, getCurrentUser, SESSION_COOKIE } from "@/modules/auth";
import { invalidateSession } from "@/modules/auth/session";
import { createCircle, createInvite, joinByCode } from "@/modules/circles";
import { createLog, addComment, addReaction } from "@/modules/diary";
import { getOrCacheMovie } from "@/modules/tmdb";
import { createList, addItem } from "@/modules/lists";
import { notify } from "@/modules/notifications";
import { listMembers } from "@/modules/circles";

async function ctx() {
  const db = getDb(env().DB);
  const user = await requireUser();
  return { db, user };
}

export async function createCircleAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { db, user } = await ctx();
  const circle = await createCircle(db, user.id, name);
  revalidatePath("/circles");
  redirect(`/circles/${circle.id}`);
}

export async function createInviteAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const { db, user } = await ctx();
  await createInvite(db, circleId, user.id);
  revalidatePath(`/circles/${circleId}`);
}

export async function joinAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const { db, user } = await ctx();
  const res = await joinByCode(db, user.id, code, Date.now());
  if ("circleId" in res) redirect(`/circles/${res.circleId}`);
}

export async function logFilmAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const tmdbId = Number(formData.get("tmdbId"));
  const ratingRaw = formData.get("rating");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const platform = String(formData.get("platform") ?? "") || null;
  const { db, user } = await ctx();
  const media = await getOrCacheMovie(db, env().TMDB_API_KEY, tmdbId);
  const log = await createLog(db, {
    circleId, userId: user.id, mediaEntityId: media.id, rating, platform,
  });
  const members = await listMembers(db, circleId);
  for (const m of members) {
    if (m.userId !== user.id) {
      await notify(db, m.userId, "new_log", { logId: log.id, circleId }).catch(() => {});
    }
  }
  revalidatePath(`/circles/${circleId}`);
  redirect(`/circles/${circleId}`);
}

export async function commentAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const logId = String(formData.get("logId"));
  const body = String(formData.get("body") ?? "").trim();
  const isSpoiler = formData.get("isSpoiler") === "on";
  if (!body) return;
  const { db, user } = await ctx();
  await addComment(db, { logId, userId: user.id, body, isSpoiler });
  revalidatePath(`/circles/${circleId}`);
}

export async function reactAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const targetId = String(formData.get("targetId"));
  const emoji = String(formData.get("emoji") ?? "❤️");
  const { db, user } = await ctx();
  await addReaction(db, { targetType: "log", targetId, userId: user.id, emoji });
  revalidatePath(`/circles/${circleId}`);
}

export async function createListAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope")) === "circle" ? "circle" : "personal";
  const circleId = formData.get("circleId") ? String(formData.get("circleId")) : undefined;
  if (!name) return;
  const { db, user } = await ctx();
  await createList(db, {
    scope,
    name,
    ownerUserId: scope === "personal" ? user.id : undefined,
    circleId: scope === "circle" ? circleId : undefined,
  });
  revalidatePath("/lists");
}

export async function addToListAction(formData: FormData) {
  const listId = String(formData.get("listId"));
  const tmdbId = Number(formData.get("tmdbId"));
  const { db, user } = await ctx();
  const media = await getOrCacheMovie(db, env().TMDB_API_KEY, tmdbId);
  await addItem(db, { listId, mediaEntityId: media.id, addedBy: user.id });
  revalidatePath("/lists");
}

// --- Fase 2: Serata + Now Watching ---

export async function createSerataAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const mode = String(formData.get("mode")) === "bracket" ? "bracket" : "tavolo";
  const mediaIds = formData.getAll("mediaId").map(String).filter(Boolean).slice(0, 8);
  if (mediaIds.length < 2) return;
  const { db, user } = await ctx();
  const { createSerata } = await import("@/modules/serata");
  const serata = await createSerata(db, { circleId, mode, createdBy: user.id, candidateMediaIds: mediaIds });
  redirect(`/serata/${serata.id}`);
}

export async function joinSerataAction(formData: FormData) {
  const serataId = String(formData.get("serataId"));
  const guestName = String(formData.get("guestName") ?? "").trim().slice(0, 40) || "Ospite";
  const db = getDb(env().DB);
  const { joinSerata } = await import("@/modules/serata");
  const user = await getCurrentUser();
  const p = await joinSerata(db, serataId, {
    userId: user?.id ?? null,
    guestName: user?.name ?? guestName,
  });
  const store = await cookies();
  store.set(`pid_${serataId}`, p.id, { path: "/", maxAge: 60 * 60 * 6 });
  revalidatePath(`/serata/${serataId}`);
}

export async function voteSerataAction(formData: FormData) {
  const serataId = String(formData.get("serataId"));
  const mediaEntityId = String(formData.get("mediaId"));
  const kind = String(formData.get("kind")) as "dot" | "veto" | "pick";
  const round = Number(formData.get("round") ?? 0);
  const store = await cookies();
  const participantId = store.get(`pid_${serataId}`)?.value;
  if (!participantId) return;
  const db = getDb(env().DB);
  const { castVote } = await import("@/modules/serata");
  await castVote(db, { serataId, participantId, mediaEntityId, kind, round });
  revalidatePath(`/serata/${serataId}`);
}

export async function closeSerataAction(formData: FormData) {
  const serataId = String(formData.get("serataId"));
  const db = getDb(env().DB);
  const { closeSerata } = await import("@/modules/serata");
  await closeSerata(db, serataId);
  revalidatePath(`/serata/${serataId}`);
}

export async function setNowWatchingAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const mediaEntityId = String(formData.get("mediaEntityId"));
  const { db, user } = await ctx();
  const { setNowWatching } = await import("@/modules/now-watching");
  await setNowWatching(db, user.id, circleId, mediaEntityId);
  revalidatePath(`/circles/${circleId}`);
}

export async function clearNowWatchingAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const { db, user } = await ctx();
  const { clearNowWatching } = await import("@/modules/now-watching");
  await clearNowWatching(db, user.id, circleId);
  revalidatePath(`/circles/${circleId}`);
}

// --- Fase 3: import mock ---

const IMPORT_SAMPLES: Record<string, { tmdbId: number; rating: number }[]> = {
  letterboxd: [
    { tmdbId: 550, rating: 4.5 },
    { tmdbId: 603, rating: 4 },
    { tmdbId: 278, rating: 5 },
    { tmdbId: 807, rating: 3.5 },
  ],
  anilist: [
    { tmdbId: 1429, rating: 5 },
    { tmdbId: 31911, rating: 4.5 },
    { tmdbId: 13916, rating: 4 },
  ],
};

export async function importAction(formData: FormData) {
  const circleId = String(formData.get("circleId"));
  const source = String(formData.get("source")) === "anilist" ? "anilist" : "letterboxd";
  const { db, user } = await ctx();
  const { getOrCacheMovie } = await import("@/modules/tmdb");
  const { createLog } = await import("@/modules/diary");
  for (const s of IMPORT_SAMPLES[source]) {
    const media = await getOrCacheMovie(db, env().TMDB_API_KEY, s.tmdbId);
    await createLog(db, { circleId, userId: user.id, mediaEntityId: media.id, rating: s.rating });
  }
  revalidatePath(`/circles/${circleId}`);
  redirect(`/circles/${circleId}`);
}

export async function logoutAction() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (sid) {
    const db = getDb(env().DB);
    await invalidateSession(db, sid);
    store.delete(SESSION_COOKIE);
  }
  redirect("/");
}
