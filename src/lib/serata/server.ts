import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { getActiveInvite } from "@/lib/core/circles";
import type { MediaSummary } from "@/lib/data";
import {
  closeMatch, closeTable, currentMatch, matchProgress, roundName,
  type Ballot, type BracketState, type SerataState, type TableState,
} from "./engine";

const titleFor = (locale: string) =>
  sql<string>`coalesce((select ${s.mediaTitle.title} from ${s.mediaTitle} where ${s.mediaTitle.mediaId} = ${s.mediaEntity.id} and ${s.mediaTitle.locale} = ${locale}), ${s.mediaEntity.originalTitle})`;

export async function getSerataByCode(code: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.serata).where(eq(s.serata.code, code.toUpperCase()));
  return row ?? null;
}

export async function getCandidates(serataId: string, locale: string): Promise<(MediaSummary & { seed: number })[]> {
  const db = await getDb();
  return db
    .select({ id: s.mediaEntity.id, kind: s.mediaEntity.kind, title: titleFor(locale), year: s.mediaEntity.year, posterPath: s.mediaEntity.posterPath, seed: s.serataCandidate.seed })
    .from(s.serataCandidate)
    .innerJoin(s.mediaEntity, eq(s.mediaEntity.id, s.serataCandidate.mediaId))
    .where(eq(s.serataCandidate.serataId, serataId))
    .orderBy(asc(s.serataCandidate.seed));
}

export async function getParticipants(serataId: string) {
  const db = await getDb();
  return db.select({ id: s.serataParticipant.userId, name: s.serataParticipant.name, isGuest: s.serataParticipant.isGuest, image: s.user.image })
    .from(s.serataParticipant).innerJoin(s.user, eq(s.user.id, s.serataParticipant.userId))
    .where(eq(s.serataParticipant.serataId, serataId)).orderBy(asc(s.serataParticipant.joinedAt));
}

/** The polling fast path: version + membership in a single query. */
export async function getPollHead(code: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      version: s.serata.version,
      joined: sql<number>`exists (select 1 from ${s.serataParticipant} where ${s.serataParticipant.serataId} = ${s.serata.id} and ${s.serataParticipant.userId} = ${userId})`,
    })
    .from(s.serata)
    .where(eq(s.serata.code, code.toUpperCase()));
  return row ? { version: row.version, joined: Boolean(row.joined) } : null;
}

export async function isParticipant(serataId: string, userId: string) {
  const db = await getDb();
  const [p] = await db.select({ u: s.serataParticipant.userId }).from(s.serataParticipant)
    .where(and(eq(s.serataParticipant.serataId, serataId), eq(s.serataParticipant.userId, userId)));
  return Boolean(p);
}

async function bracketVotes(serataId: string, round: number, match: number) {
  const db = await getDb();
  return db.select({ userId: s.serataVote.userId, mediaId: s.serataVote.mediaId }).from(s.serataVote)
    .where(and(eq(s.serataVote.serataId, serataId), eq(s.serataVote.kind, "pick"), eq(s.serataVote.round, round), eq(s.serataVote.match, match)));
}

async function tableBallots(serataId: string) {
  const db = await getDb();
  const rows = await db.select({ userId: s.serataVote.userId, kind: s.serataVote.kind, mediaId: s.serataVote.mediaId, weight: s.serataVote.weight })
    .from(s.serataVote).where(and(eq(s.serataVote.serataId, serataId), sql`${s.serataVote.kind} in ('dot', 'veto')`));
  const byUser = new Map<string, Ballot>();
  for (const r of rows) {
    const b = byUser.get(r.userId) ?? { dots: {}, veto: null };
    if (r.kind === "dot") b.dots[r.mediaId] = (b.dots[r.mediaId] ?? 0) + r.weight;
    else b.veto = r.mediaId;
    byUser.set(r.userId, b);
  }
  return byUser;
}

/**
 * Closes the current match (Bracket) or the table (Tavolo) when everyone voted, the deadline passed,
 * or the host forces it. Uses compare-and-set on `version`, so concurrent "last votes" close it once.
 */
export async function tryClose(serataId: string, { force = false } = {}) {
  const db = await getDb();
  const [row] = await db.select().from(s.serata).where(eq(s.serata.id, serataId));
  if (!row || row.status !== "voting" || !row.state) return;
  const state = row.state as SerataState;
  const now = Date.now();
  const participants = await getParticipants(serataId);
  const expired = state.deadline !== null && now >= state.deadline;

  let next: SerataState;
  if (state.kind === "bracket") {
    const m = currentMatch(state);
    if (!m) return;
    const votes = await bracketVotes(serataId, state.round, state.match);
    if (!force && !expired && votes.length < participants.length) return;
    const tally = { a: votes.filter((v) => v.mediaId === m.a).length, b: votes.filter((v) => v.mediaId === m.b).length };
    next = closeMatch(state, tally, Math.random(), now);
  } else {
    const ballots = await tableBallots(serataId);
    if (!force && !expired && ballots.size < participants.length) return;
    const candidates = (await db.select({ id: s.serataCandidate.mediaId }).from(s.serataCandidate).where(eq(s.serataCandidate.serataId, serataId))).map((c) => c.id);
    next = closeTable(state, candidates, [...ballots.values()], Math.random());
  }

  const done = next.winner !== null;
  await db.update(s.serata)
    .set({
      state: next,
      version: row.version + 1,
      ...(done ? { status: "done" as const, winnerMediaId: next.winner, finishedAt: new Date() } : {}),
    })
    .where(and(eq(s.serata.id, serataId), eq(s.serata.version, row.version)));
}

/* ───────────── What a participant's phone renders ───────────── */

export type RoomView = NonNullable<Awaited<ReturnType<typeof getRoomView>>>;

export async function getRoomView(code: string, viewerId: string, locale: string) {
  const row = await getSerataByCode(code);
  if (!row) return null;
  const db = await getDb();
  const [candidates, participants] = await Promise.all([getCandidates(row.id, locale), getParticipants(row.id)]);
  const joined = participants.some((p) => p.id === viewerId);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const state = row.state as SerataState | null;

  let voted = new Set<string>();
  let bracket = null as null | {
    round: "final" | "semi" | "quarter";
    progress: { done: number; total: number };
    a: MediaSummary | null; b: MediaSummary | null;
    myPick: string | null;
    deadline: number | null;
  };
  let table = null as null | { deadline: number | null; myBallot: Ballot | null };

  if (row.status === "voting" && state?.kind === "bracket") {
    const m = currentMatch(state);
    const votes = await bracketVotes(row.id, state.round, state.match);
    voted = new Set(votes.map((v) => v.userId));
    bracket = {
      round: roundName(state),
      progress: matchProgress(state),
      a: m?.a ? byId.get(m.a) ?? null : null,
      b: m?.b ? byId.get(m.b) ?? null : null,
      myPick: votes.find((v) => v.userId === viewerId)?.mediaId ?? null,
      deadline: state.deadline,
    };
  }
  if (row.status === "voting" && state?.kind === "table") {
    const ballots = await tableBallots(row.id);
    voted = new Set(ballots.keys());
    table = { deadline: state.deadline, myBallot: ballots.get(viewerId) ?? null };
  }

  let result = null as null | {
    winner: MediaSummary;
    finishedAt: number;
    rounds: number;
    voters: number;
    scores: { media: MediaSummary; dots: number; vetoed: boolean }[] | null;
    circle: { id: string; name: string; inviteCode: string } | null;
  };
  if (row.status === "done" && row.winnerMediaId && state) {
    // Only offered while the Cerchia has an invite that still works: an admin who revoked them closed that door.
    const [circleRow] = row.circleId
      ? await db.select({ id: s.circle.id, name: s.circle.name }).from(s.circle).where(eq(s.circle.id, row.circleId))
      : [];
    const activeInvite = circleRow ? await getActiveInvite(db, circleRow.id) : null;
    const circle = circleRow && activeInvite ? { ...circleRow, inviteCode: activeInvite.code } : null;
    result = {
      winner: byId.get(row.winnerMediaId)!,
      finishedAt: (row.finishedAt ?? row.createdAt).getTime(),
      rounds: state.kind === "bracket" ? state.rounds.length : 1,
      voters: participants.length,
      scores: state.kind === "table" && (state as TableState).scores
        ? (state as TableState).scores!.map((sc) => ({ media: byId.get(sc.mediaId)!, dots: sc.dots, vetoed: sc.vetoed }))
        : null,
      // The invite is only offered to people who took part (guests included), after the match.
      circle: joined && circle ? circle : null,
    };
  }

  return {
    code: row.code,
    mode: row.mode,
    status: row.status,
    version: row.version,
    circleId: row.circleId,
    isHost: row.hostId === viewerId,
    joined,
    candidates,
    participants: participants.map((p) => ({ ...p, voted: voted.has(p.id) })),
    bracket,
    table,
    result,
    serverNow: Date.now(),
  };
}

export async function getRecentSerate(circleId: string, locale: string, limit = 10) {
  const db = await getDb();
  return db
    .select({
      code: s.serata.code, mode: s.serata.mode, status: s.serata.status, createdAt: s.serata.createdAt,
      winner: sql<string | null>`(select ${titleFor(locale)} from ${s.mediaEntity} where ${s.mediaEntity.id} = ${s.serata.winnerMediaId})`,
    })
    .from(s.serata)
    .where(eq(s.serata.circleId, circleId))
    .orderBy(sql`${s.serata.createdAt} desc`)
    .limit(limit);
}

/** Public, share-safe data for the 9:16 Card: no participants, no votes. */
export async function getCardData(code: string, locale: string) {
  const row = await getSerataByCode(code);
  if (!row || row.status !== "done" || !row.winnerMediaId) return null;
  const db = await getDb();
  const [[winner], [circle], [{ n }]] = await Promise.all([
    db.select({ id: s.mediaEntity.id, kind: s.mediaEntity.kind, title: titleFor(locale), year: s.mediaEntity.year, posterPath: s.mediaEntity.posterPath, runtimeMin: s.mediaEntity.runtimeMin })
      .from(s.mediaEntity).where(eq(s.mediaEntity.id, row.winnerMediaId)),
    row.circleId ? db.select({ name: s.circle.name }).from(s.circle).where(eq(s.circle.id, row.circleId)) : Promise.resolve([undefined]),
    db.select({ n: sql<number>`count(*)` }).from(s.serataParticipant).where(eq(s.serataParticipant.serataId, row.id)),
  ]);
  const state = row.state as SerataState;
  return {
    winner,
    circleName: circle?.name ?? null,
    mode: row.mode,
    rounds: state.kind === "bracket" ? (state as BracketState).rounds.length : 1,
    voters: n,
    finishedAt: row.finishedAt ?? row.createdAt,
  };
}

/** Share-safe data for the invite preview of a Serata that is still open: who hosts, how, and which posters. No votes. */
export async function getInviteData(code: string, locale: string) {
  const row = await getSerataByCode(code);
  if (!row || row.status === "done") return null;
  const [candidates, participants] = await Promise.all([getCandidates(row.id, locale), getParticipants(row.id)]);
  return {
    host: participants.find((p) => p.id === row.hostId)?.name ?? participants[0]?.name ?? "",
    mode: row.mode,
    posters: candidates.slice(0, 4).map((c) => c.posterPath).filter((p): p is string => Boolean(p)),
    count: candidates.length,
  };
}
