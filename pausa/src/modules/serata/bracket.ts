// Single-elimination bracket. Each round pairs survivors; a pick-vote per pair
// decides who advances. Odd one out gets a bye.

export function bracketPairs(ids: string[]): [string, string | null][] {
  const pairs: [string, string | null][] = [];
  for (let i = 0; i < ids.length; i += 2) {
    pairs.push([ids[i], ids[i + 1] ?? null]);
  }
  return pairs;
}

// picks: for each pair index, the winning media id chosen by majority.
// A bye (b === null) advances automatically.
export function advanceRound(
  pairs: [string, string | null][],
  picks: Record<number, string>,
): string[] {
  return pairs.map(([a, b], i) => {
    if (b === null) return a;
    const chosen = picks[i];
    return chosen === a || chosen === b ? chosen : a;
  });
}

// Tally pick-votes for one pair; more votes wins, tie-break to `a`.
export function pickWinner(
  a: string,
  b: string,
  votesForPair: { mediaEntityId: string }[],
): string {
  let av = 0;
  let bv = 0;
  for (const v of votesForPair) {
    if (v.mediaEntityId === a) av++;
    else if (v.mediaEntityId === b) bv++;
  }
  return bv > av ? b : a;
}

export function isComplete(survivors: string[]): boolean {
  return survivors.length <= 1;
}
