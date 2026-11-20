"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing, type Locale } from "@/i18n/routing";
import { getDb } from "@/db";
import { requireUser } from "./session";
import { getCircleForMember } from "./data";
import { isAvatar, toAvatarImage } from "./avatars";
import { MAX_BIO, addFavorite, confirms, removeFavorite, removeMyLogsFromCircle, saveProfile } from "./core/profile";

function localeFrom(value: unknown): Locale {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

const id = z.string().min(1).max(64);

function profileChanged() {
  revalidatePath("/", "layout"); // name and picture show on every page (bar, diary, members)
}

/**
 * The profile form: name, picture, bio, genres.
 * `avatar`: "" keeps the current picture, "none" goes back to the initial, a glyph from the gallery picks it.
 */
export async function saveProfileAction(formData: FormData) {
  const user = await requireUser();
  const locale = localeFrom(formData.get("locale"));
  const name = z.string().trim().min(1).max(40).parse(formData.get("name"));
  const bio = z.string().max(MAX_BIO * 2).catch("").parse(formData.get("bio") ?? "");
  const genres = formData.getAll("genre").map(String);
  const avatar = String(formData.get("avatar") ?? "");
  const image = avatar === "none" ? null : isAvatar(avatar) ? toAvatarImage(avatar) : undefined;
  await saveProfile(await getDb(), { userId: user.id, name, bio, genres, image });
  profileChanged();
  redirect(`/${locale}/me?ok=profile`);
}

export async function addFavoriteAction(formData: FormData) {
  const user = await requireUser();
  const res = await addFavorite(await getDb(), user.id, id.parse(formData.get("mediaId")));
  revalidatePath("/[locale]/me", "layout");
  return res;
}

export async function removeFavoriteAction(formData: FormData) {
  const user = await requireUser();
  await removeFavorite(await getDb(), user.id, id.parse(formData.get("mediaId")));
  revalidatePath("/[locale]/me", "layout");
}

/** Takes all my viewings out of one Cerchia (they stay in my space). Needs the word PAUSA typed back. */
export async function removeMyLogsFromCircleAction(formData: FormData) {
  const user = await requireUser();
  const locale = localeFrom(formData.get("locale"));
  const circleId = id.parse(formData.get("circleId"));
  if (!(await getCircleForMember(circleId, user.id))) redirect(`/${locale}`);
  if (!confirms(formData.get("word"))) redirect(`/${locale}/c/${circleId}/members?e=word#mine`);
  const { removed } = await removeMyLogsFromCircle(await getDb(), { userId: user.id, circleId });
  revalidatePath(`/[locale]/c/[circleId]`, "layout");
  revalidatePath("/[locale]/me", "layout");
  redirect(`/${locale}/c/${circleId}/members?removed=${removed}#mine`);
}
