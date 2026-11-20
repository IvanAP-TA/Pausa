"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { getDb } from "@/db";
import { requireUser } from "./session";
import { enforce } from "./limit-guard";
import { setLogScope, shareLog, unshareLog } from "./core/sharing";
import { deleteLog } from "./core/content";
import { ensureMediaDetail } from "./media-detail";

/* The personal space: who reads each of my logs. Each action answers by sending the person back to the same row, with a
 * short confirmation (?ok=) the page announces. */

const id = z.string().min(1).max(64);
const localeFrom = (v: unknown) => (typeof v === "string" && hasLocale(routing.locales, v) ? v : routing.defaultLocale);

function back(formData: FormData, logId: string, ok: string): never {
  // Only same-page filters travel back: nothing from the form is trusted as a URL.
  const only = formData.get("only") === "private" ? "&only=private" : "";
  redirect(`/${localeFrom(formData.get("locale"))}/me/diary?ok=${ok}${only}#l-${logId}`);
}

function refresh() {
  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]/c/[circleId]", "layout");
}

export async function shareLogAction(formData: FormData) {
  const user = await requireUser();
  await enforce("shareLog", user.id);
  const logId = id.parse(formData.get("logId"));
  const circleId = id.parse(formData.get("circleId"));
  const res = await shareLog(await getDb(), { logId, circleId, actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  refresh();
  back(formData, logId, "shared");
}

export async function unshareLogAction(formData: FormData) {
  const user = await requireUser();
  const logId = id.parse(formData.get("logId"));
  const circleId = id.parse(formData.get("circleId"));
  const res = await unshareLog(await getDb(), { logId, circleId, actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  refresh();
  back(formData, logId, "unshared");
}

export async function setLogScopeAction(formData: FormData) {
  const user = await requireUser();
  const logId = id.parse(formData.get("logId"));
  const scope = z.enum(["circles", "private"]).parse(formData.get("scope"));
  const res = await setLogScope(await getDb(), { logId, actorId: user.id, scope });
  if ("error" in res) throw new Error(res.error);
  refresh();
  back(formData, logId, scope === "private" ? "private" : "open");
}

/** Deletes one of my logs for good, from my space and from every Cerchia that showed it. The row is gone: back to the top. */
export async function deleteMyLogAction(formData: FormData) {
  const user = await requireUser();
  const res = await deleteLog(await getDb(), { logId: id.parse(formData.get("logId")), actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  refresh();
  const only = formData.get("only") === "private" ? "&only=private" : "";
  redirect(`/${localeFrom(formData.get("locale"))}/me/diary?ok=deleted${only}`);
}

/** For the log form: what the picked title is about, when a catalogue knows. */
export async function getTitleDetail(mediaId: string, locale: string) {
  await requireUser();
  const detail = await ensureMediaDetail(id.parse(mediaId), localeFrom(locale));
  return { overview: detail.overview, genres: detail.genres };
}
