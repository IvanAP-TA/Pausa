export interface SerataVoteLite {
  mediaEntityId: string;
  kind: "dot" | "veto" | "pick";
}

export interface TavoloResult {
  scores: Record<string, number>;
  vetoed: string[];
  winnerId: string | null;
}

// Dot voting + emergency veto. Winner = highest dot count among non-vetoed.
// Tie-break is stable by candidate order.
export function tallyTavolo(votes: SerataVoteLite[], candidateIds: string[]): TavoloResult {
  const vetoed = new Set(votes.filter((v) => v.kind === "veto").map((v) => v.mediaEntityId));
  const scores: Record<string, number> = {};
  for (const id of candidateIds) scores[id] = 0;
  for (const v of votes) {
    if (v.kind === "dot" && !vetoed.has(v.mediaEntityId) && v.mediaEntityId in scores) {
      scores[v.mediaEntityId] += 1;
    }
  }
  let winnerId: string | null = null;
  let best = -1;
  for (const id of candidateIds) {
    if (vetoed.has(id)) continue;
    if (scores[id] > best) {
      best = scores[id];
      winnerId = id;
    }
  }
  return { scores, vetoed: [...vetoed], winnerId };
}
