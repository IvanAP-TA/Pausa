"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { z } from "zod";
import { routing, type Locale } from "@/i18n/routing";
import { getDb } from "@/db";
import { getAuth } from "./auth";
import { requireUser } from "./session";
import { getCircleForMember } from "./data";
import { isOperator } from "./operator";
import { enforce } from "./limit-guard";
import { REPORT_REASONS, createReport, resolveReport } from "./core/moderation";
import { deleteCircle } from "./core/circles";
import { deleteAccount, updateProfile } from "./core/account";
import { MAX_SEASON, toPosition } from "./core/progress";
import {
  deleteComment, deleteList, deleteLog, moveListItem, removeListItem, renameCircle, renameList, updateComment, updateLog,
} from "./core/content";

/* Edit/delete, Cerchia profile, lists, account. The rules live in core/content.ts and core/account.ts (tested on real SQLite);
 * these actions only parse the form, say who is acting, and send the person back where they were. */

function localeFrom(value: unknown): Locale {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

const id = z.string().min(1).max(64);

/* ───────────── Log ───────────── */

export async function updateLogAction(formData: FormData) {
  const user = await requireUser();
  const locale = localeFrom(formData.get("locale"));
  const input = z.object({
    logId: id,
    circleId: id,
    watchedOn: z.iso.date(),
    rating: z.coerce.number().int().min(0).max(10).transform((n) => (n === 0 ? null : n)),
    review: z.string().trim().max(4000).transform((v) => v || null),
    platform: z.string().trim().max(60).transform((v) => v || null),
    season: z.number().int().min(1).max(MAX_SEASON).nullable(),
    containsSpoilers: z.boolean(),
    watchedWith: z.array(z.string()).max(20),
  }).parse({
    logId: formData.get("logId"),
    circleId: formData.get("circleId"),
    watchedOn: formData.get("watchedOn"),
    rating: formData.get("rating") ?? 0,
    review: formData.get("review") ?? "",
    platform: formData.get("platform") ?? "",
    season: toPosition(formData.get("season"), MAX_SEASON),
    containsSpoilers: formData.get("containsSpoilers") === "on",
    watchedWith: formData.getAll("watchedWith").map(String),
  });
  if (!(await getCircleForMember(input.circleId, user.id))) throw new Error("Not a member of this circle");
  const res = await updateLog(await getDb(), { ...input, actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  revalidatePath("/[locale]/c/[circleId]", "layout");
  redirect(`/${locale}/c/${input.circleId}/l/${input.logId}`);
}

export async function deleteLogAction(formData: FormData) {
  const user = await requireUser();
  const logId = id.parse(formData.get("logId"));
  const circleId = id.parse(formData.get("circleId"));
  const res = await deleteLog(await getDb(), { logId, actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  revalidatePath("/[locale]/c/[circleId]", "layout");
  redirect(`/${localeFrom(formData.get("locale"))}/c/${circleId}`);
}

/* ───────────── Comments ───────────── */

export async function updateCommentAction(formData: FormData) {
  const user = await requireUser();
  const res = await updateComment(await getDb(), {
    commentId: id.parse(formData.get("commentId")),
    actorId: user.id,
    body: z.string().trim().min(1).max(2000).parse(formData.get("body")),
    isSpoiler: formData.get("isSpoiler") === "on",
  });
  if ("error" in res) throw new Error(res.error);
  revalidatePath("/[locale]/c/[circleId]/l/[logId]", "page");
}

export async function deleteCommentAction(formData: FormData) {
  const user = await requireUser();
  const res = await deleteComment(await getDb(), { commentId: id.parse(formData.get("commentId")), actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  revalidatePath("/[locale]/c/[circleId]/l/[logId]", "page");
  revalidatePath("/[locale]/c/[circleId]", "page");
}

/* ───────────── Cerchia profile ───────────── */

export async function renameCircleAction(formData: FormData) {
  const user = await requireUser();
  const circleId = id.parse(formData.get("circleId"));
  const locale = localeFrom(formData.get("locale"));
  const res = await renameCircle(await getDb(), { circleId, actorId: user.id, name: z.string().trim().min(1).max(60).parse(formData.get("name")) });
  revalidatePath("/[locale]/c/[circleId]", "layout");
  redirect(`/${locale}/c/${circleId}/members${"error" in res ? `?e=${res.error}` : ""}`);
}

/* ───────────── Lists ───────────── */

function listsChanged() {
  revalidatePath("/[locale]/c/[circleId]/lists", "page");
}

export async function moveListItemAction(formData: FormData) {
  const user = await requireUser();
  const res = await moveListItem(await getDb(), {
    listId: id.parse(formData.get("listId")),
    mediaId: id.parse(formData.get("mediaId")),
    direction: z.enum(["up", "down"]).parse(formData.get("direction")),
    actorId: user.id,
  });
  if ("error" in res) throw new Error(res.error);
  listsChanged();
}

export async function removeListItemAction(formData: FormData) {
  const user = await requireUser();
  const res = await removeListItem(await getDb(), { listId: id.parse(formData.get("listId")), mediaId: id.parse(formData.get("mediaId")), actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  listsChanged();
}

export async function renameListAction(formData: FormData) {
  const user = await requireUser();
  const res = await renameList(await getDb(), { listId: id.parse(formData.get("listId")), actorId: user.id, name: z.string().trim().min(1).max(80).parse(formData.get("name")) });
  if ("error" in res) throw new Error(res.error);
  listsChanged();
}

export async function deleteListAction(formData: FormData) {
  const user = await requireUser();
  const res = await deleteList(await getDb(), { listId: id.parse(formData.get("listId")), actorId: user.id });
  if ("error" in res) throw new Error(res.error);
  listsChanged();
}

/* ───────────── Account ───────────── */

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(40).parse(formData.get("name"));
  await updateProfile(await getDb(), { userId: user.id, name });
  revalidatePath("/", "layout");
  redirect(`/${localeFrom(formData.get("locale"))}/account?saved=1`);
}

/** Needs the account email typed back: deleting is not undoable, so a stray tap must not do it. */
export async function deleteAccountAction(formData: FormData) {
  const user = await requireUser();
  const locale = localeFrom(formData.get("locale"));
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) redirect(`/${locale}/account?e=confirm`);
  // End the session first (clears the cookie, including the 5-minute cookie cache), then erase.
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  await deleteAccount(await getDb(), user.id);
  redirect(`/${locale}?deleted=1`);
}

/* ───────────── Moderation ───────────── */

export async function reportAction(formData: FormData) {
  const user = await requireUser();
  await enforce("report", user.id);
  const input = z.object({
    kind: z.enum(["comment", "log"]),
    targetId: id,
    reason: z.enum(REPORT_REASONS as [string, ...string[]]),
    note: z.string().trim().max(500).optional(),
  }).parse({ kind: formData.get("kind"), targetId: formData.get("targetId"), reason: formData.get("reason"), note: formData.get("note") ?? undefined });
  await createReport(await getDb(), { reporterId: user.id, kind: input.kind, targetId: input.targetId, reason: input.reason as (typeof REPORT_REASONS)[number], note: input.note });
  const back = String(formData.get("back") ?? "");
  redirect(back.startsWith("/") && !back.startsWith("//") ? `${back}${back.includes("?") ? "&" : "?"}reported=1` : "/");
}

/** Operator pages only: anyone else gets the same 404 as a page that does not exist. */
export async function resolveReportAction(formData: FormData) {
  const user = await requireUser();
  if (!isOperator(user.email)) throw new Error("Not found");
  await resolveReport(await getDb(), { reportId: id.parse(formData.get("reportId")), action: z.enum(["dismiss", "remove"]).parse(formData.get("action")) });
  revalidatePath("/[locale]/admin/reports", "page");
}

/** Closing a Cerchia is not undoable: the admin types its name back. */
export async function deleteCircleAction(formData: FormData) {
  const user = await requireUser();
  const circleId = id.parse(formData.get("circleId"));
  const locale = localeFrom(formData.get("locale"));
  const circle = await getCircleForMember(circleId, user.id);
  if (!circle || circle.role !== "admin") redirect(`/${locale}/c/${circleId}/members?e=forbidden`);
  if (String(formData.get("name") ?? "").trim() !== circle.name) redirect(`/${locale}/c/${circleId}/members?e=confirm`);
  await deleteCircle(await getDb(), { circleId, actorId: user.id });
  revalidatePath("/", "layout");
  redirect(`/${locale}`);
}
