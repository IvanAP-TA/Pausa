import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  serate,
  serataCandidates,
  serataParticipants,
  serataVotes,
  mediaEntities,
} from "@/db/schema";
import { newId } from "@/lib/id";
import { tallyTavolo, type SerataVoteLite } from "./tavolo";

export { tallyTavolo };
export * from "./bracket";

export async function createSerata(
  db: Db,
  input: { circleId?: string | null; mode: "bracket" | "tavolo"; createdBy: string; candidateMediaIds: string[] },
) {
  const serata = {
    id: newId(),
    circleId: input.circleId ?? null,
    mode: input.mode,
    status: "open" as const,
    createdBy: input.createdBy,
    winnerMediaId: null,
    createdAt: new Date(),
  };
  await db.insert(serate).values(serata);
  let pos = 0;
  for (const mediaEntityId of input.candidateMediaIds.slice(0, 8)) {
    await db.insert(serataCandidates).values({ serataId: serata.id, mediaEntityId, position: pos++ });
  }
  return serata;
}

export async function joinSerata(
  db: Db,
  serataId: string,
  p: { userId?: string | null; guestName: string; avatar?: string | null },
) {
  const row = {
    id: newId(),
    serataId,
    userId: p.userId ?? null,
    guestName: p.guestName,
    avatar: p.avatar ?? null,
    joinedAt: new Date(),
  };
  await db.insert(serataParticipants).values(row);
  return row;
}

export async function castVote(
  db: Db,
  v: { serataId: string; participantId: string; mediaEntityId: string; kind: "dot" | "veto" | "pick"; round?: number },
) {
  const row = {
    id: newId(),
    serataId: v.serataId,
    participantId: v.participantId,
    mediaEntityId: v.mediaEntityId,
    kind: v.kind,
    round: v.round ?? 0,
    createdAt: new Date(),
  };
  await db.insert(serataVotes).values(row);
  return row;
}

export async function getSerataState(db: Db, serataId: string) {
  const serata = await db.select().from(serate).where(eq(serate.id, serataId)).get();
  if (!serata) return null;
  const candidates = await db
    .select({ media: mediaEntities, position: serataCandidates.position })
    .from(serataCandidates)
    .innerJoin(mediaEntities, eq(mediaEntities.id, serataCandidates.mediaEntityId))
    .where(eq(serataCandidates.serataId, serataId))
    .all();
  candidates.sort((a, b) => a.position - b.position);
  const participants = await db
    .select()
    .from(serataParticipants)
    .where(eq(serataParticipants.serataId, serataId))
    .all();
  const votes = await db.select().from(serataVotes).where(eq(serataVotes.serataId, serataId)).all();
  return { serata, candidates, participants, votes };
}

export async function closeSerata(db: Db, serataId: string) {
  const state = await getSerataState(db, serataId);
  if (!state) return null;
  const candidateIds = state.candidates.map((c) => c.media.id);
  let winnerId: string | null = null;

  if (state.serata.mode === "tavolo") {
    const lite: SerataVoteLite[] = state.votes.map((v) => ({ mediaEntityId: v.mediaEntityId, kind: v.kind }));
    winnerId = tallyTavolo(lite, candidateIds).winnerId;
  } else {
    // bracket (mock): media with most pick votes wins; tie-break by candidate order
    const counts: Record<string, number> = {};
    for (const id of candidateIds) counts[id] = 0;
    for (const v of state.votes) if (v.kind === "pick" && v.mediaEntityId in counts) counts[v.mediaEntityId]++;
    let best = -1;
    for (const id of candidateIds) if (counts[id] > best) { best = counts[id]; winnerId = id; }
  }

  await db.update(serate).set({ status: "done", winnerMediaId: winnerId }).where(eq(serate.id, serataId));
  return winnerId;
}
