"use server";

import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { atomically, getDb, schema as s } from "@/db";
import { routing, type Locale } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { getCircleForMember } from "@/lib/data";
import { pushNotifications } from "@/lib/push";
import { enforce } from "@/lib/limit-guard";
import { isGuestAvatar, toAvatarImage } from "@/lib/avatars";
import { requireUser } from "@/lib/session";
import { DOTS, MAX_CANDIDATES, MIN_CANDIDATES, currentMatch, initBracket, initTable, validBallot, type SerataState } from "./engine";
import { getSerataByCode, tryClose } from "./server";

/** The version bump that tells every phone in the room to refetch. */
const bump = (db: Awaited<ReturnType<typeof getDb>>, serataId: string) =>
  db.update(s.serata).set({ version: sql`${s.serata.version} + 1` }).where(eq(s.serata.id, serataId));

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

function localeFrom(value: unknown): Locale {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/** Any session works here, anonymous guests included. */
async function requireAnySession() {
  const session = await getSession();
  if (!session) throw new Error("No session");
  return session.user;
}

async function requireParticipant(code: string) {
  const user = await requireAnySession();
  const serata = await getSerataByCode(code);
  if (!serata) throw new Error("Serata not found");
  const db = await getDb();
  const [p] = await db.select().from(s.serataParticipant)
    .where(and(eq(s.serataParticipant.serataId, serata.id), eq(s.serataParticipant.userId, user.id)));
  if (!p) throw new Error("Not a participant");
  return { user, serata };
}

/* ───────────── Create / join / start ───────────── */

export async function createSerata(formData: FormData) {
  const user = await requireUser();
  await enforce("createSerata", user.id);
  const locale = localeFrom(formData.get("locale"));
  const circleId = z.string().min(1).parse(formData.get("circleId"));
  const mode = z.enum(["bracket", "table"]).parse(formData.get("mode"));
  const mediaIds = z.array(z.string().min(1)).min(MIN_CANDIDATES).max(MAX_CANDIDATES)
    .parse([...new Set(formData.getAll("mediaId").map(String))]);
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");

  const db = await getDb();
  const id = crypto.randomUUID();
  const code = newCode();
  const others = await db.select({ userId: s.circleMember.userId }).from(s.circleMember)
    .where(and(eq(s.circleMember.circleId, circleId), ne(s.circleMember.userId, user.id)));
  await atomically([
    db.insert(s.serata).values({ id, code, circleId, hostId: user.id, mode }),
    db.insert(s.serataCandidate).values(mediaIds.map((mediaId, seed) => ({ serataId: id, mediaId, seed }))),
    db.insert(s.serataParticipant).values({ serataId: id, userId: user.id, name: user.name }),
    others.length > 0 && db.insert(s.notification).values(others.map((o) => ({ userId: o.userId, type: "serata_invite" as const, actorId: user.id, circleId }))),
  ]);
  pushNotifications(others.map((o) => ({ userId: o.userId, type: "serata_invite" as const, actorId: user.id, circleId, serataCode: code })));
  redirect(`/${locale}/s/${code}`);
}

/** Joins the current session (member or anonymous guest) to a Serata. Guests send a display name. */
export async function joinSerata(code: string, guestName?: string, guestAvatar?: string) {
  const user = await requireAnySession();
  const serata = await getSerataByCode(code);
  if (!serata || serata.status === "done") throw new Error("Serata closed");
  const isGuest = Boolean((user as { isAnonymous?: boolean | null }).isAnonymous);
  const name = isGuest ? z.string().trim().min(1).max(24).parse(guestName) : user.name;

  const db = await getDb();
  await atomically([
    isGuest && db.update(s.user).set({ name, ...(isGuestAvatar(guestAvatar) ? { image: toAvatarImage(guestAvatar) } : {}) }).where(eq(s.user.id, user.id)),
    db.insert(s.serataParticipant).values({ serataId: serata.id, userId: user.id, name, isGuest }).onConflictDoNothing(),
    bump(db, serata.id),
  ]);
}

export async function startSerata(code: string) {
  const user = await requireAnySession();
  const serata = await getSerataByCode(code);
  if (!serata || serata.hostId !== user.id || serata.status !== "lobby") return;
  const db = await getDb();
  const seeds = (await db.select({ id: s.serataCandidate.mediaId }).from(s.serataCandidate)
    .where(eq(s.serataCandidate.serataId, serata.id)).orderBy(s.serataCandidate.seed)).map((c) => c.id);
  const now = Date.now();
  const state: SerataState = serata.mode === "bracket" ? initBracket(seeds, now) : initTable(now);
  await db.update(s.serata)
    .set({ status: "voting", state, version: serata.version + 1 })
    .where(and(eq(s.serata.id, serata.id), eq(s.serata.version, serata.version)));
}

/* ───────────── Voting ───────────── */

export async function voteBracket(code: string, mediaId: string) {
  const { user, serata } = await requireParticipant(code);
  const state = serata.state as SerataState | null;
  if (serata.status !== "voting" || state?.kind !== "bracket") return;
  const m = currentMatch(state);
  if (!m || (mediaId !== m.a && mediaId !== m.b)) return;

  const db = await getDb();
  const where = and(eq(s.serataVote.serataId, serata.id), eq(s.serataVote.userId, user.id),
    eq(s.serataVote.kind, "pick"), eq(s.serataVote.round, state.round), eq(s.serataVote.match, state.match));
  await atomically([
    db.delete(s.serataVote).where(where), // changing your mind is allowed until the match closes
    db.insert(s.serataVote).values({ serataId: serata.id, userId: user.id, round: state.round, match: state.match, kind: "pick", mediaId }),
    bump(db, serata.id),
  ]);
  await tryClose(serata.id);
}

export async function submitBallot(code: string, dots: Record<string, number>, veto: string | null) {
  const { user, serata } = await requireParticipant(code);
  const state = serata.state as SerataState | null;
  if (serata.status !== "voting" || state?.kind !== "table") return;
  const db = await getDb();
  const candidates = (await db.select({ id: s.serataCandidate.mediaId }).from(s.serataCandidate)
    .where(eq(s.serataCandidate.serataId, serata.id))).map((c) => c.id);
  const ballot = { dots, veto };
  if (!validBallot(ballot, candidates)) throw new Error(`Place exactly ${DOTS} dots`);

  const rows: (typeof s.serataVote.$inferInsert)[] = Object.entries(dots).filter(([, n]) => n > 0)
    .map(([mediaId, weight]) => ({ serataId: serata.id, userId: user.id, kind: "dot", mediaId, weight }));
  if (veto) rows.push({ serataId: serata.id, userId: user.id, kind: "veto" as const, mediaId: veto, weight: 1 });
  // Replace the ballot in one transaction: a half-written ballot would count as "voted" with too few dots.
  await atomically([
    db.delete(s.serataVote).where(and(eq(s.serataVote.serataId, serata.id), eq(s.serataVote.userId, user.id),
      sql`${s.serataVote.kind} in ('dot', 'veto')`)),
    db.insert(s.serataVote).values(rows),
    bump(db, serata.id),
  ]);
  await tryClose(serata.id);
}

/** Host: close the current match / the table now (someone left, or the group has decided). */
export async function forceAdvance(code: string) {
  const user = await requireAnySession();
  const serata = await getSerataByCode(code);
  if (!serata || serata.hostId !== user.id) return;
  await tryClose(serata.id, { force: true });
}

/** Any participant's phone calls this when the countdown hits zero; the server re-checks the deadline. */
export async function tick(code: string) {
  const { serata } = await requireParticipant(code);
  await tryClose(serata.id);
}
