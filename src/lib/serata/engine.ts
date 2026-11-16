/* Serata decision engine: pure functions, no I/O. State is stored as JSON on `serata.state`.
 *
 * Bracket ("Torneo lampo"): single elimination, one head-to-head at a time.
 *   - 2..8 candidates; bracket size is the next power of two, byes go to the top seeds.
 *   - A match closes when everyone voted or its deadline passes. Tie → random draw.
 * Tavolo: everyone places exactly DOTS dots and may veto one title.
 *   - Winner = most dots among non-vetoed titles. If every title is vetoed, vetoes are ignored. Tie → random draw.
 */

export const MATCH_MS = 30_000;
export const TABLE_MS = 60_000;
export const DOTS = 3;
export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = 8;

export type Match = { a: string | null; b: string | null; w: string | null; votes?: { a: number; b: number } };

export type BracketState = {
  kind: "bracket";
  rounds: Match[][];
  round: number;
  match: number;
  deadline: number | null;
  winner: string | null;
};

export type TableScore = { mediaId: string; dots: number; vetoed: boolean };
export type TableState = { kind: "table"; deadline: number | null; scores: TableScore[] | null; winner: string | null };

export type SerataState = BracketState | TableState;

export type Ballot = { dots: Record<string, number>; veto: string | null };

/* Standard seeding: 1 meets the last seed, byes land on the top seeds. */
const ORDER: Record<number, number[]> = { 2: [0, 1], 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] };

function bracketSize(n: number) {
  if (n < MIN_CANDIDATES || n > MAX_CANDIDATES) throw new Error(`Bracket needs ${MIN_CANDIDATES}-${MAX_CANDIDATES} candidates`);
  return n <= 2 ? 2 : n <= 4 ? 4 : 8;
}

/** `seeds` are media ids, best seed first. */
export function initBracket(seeds: string[], now: number): BracketState {
  const size = bracketSize(seeds.length);
  const slots = ORDER[size].map((i) => seeds[i] ?? null);
  const rounds: Match[][] = [];
  let width = size / 2;
  rounds.push(Array.from({ length: width }, (_, k) => ({ a: slots[2 * k], b: slots[2 * k + 1], w: null })));
  while (width > 1) {
    width /= 2;
    rounds.push(Array.from({ length: width }, () => ({ a: null, b: null, w: null })));
  }
  const state: BracketState = { kind: "bracket", rounds, round: 0, match: 0, deadline: null, winner: null };
  return settle(state, now);
}

/** Resolves byes from the current pointer onward and sets the next deadline. */
function settle(state: BracketState, now: number): BracketState {
  while (state.winner === null) {
    const m = state.rounds[state.round][state.match];
    if (m.a && m.b) {
      state.deadline = now + MATCH_MS;
      return state;
    }
    // Bye: the present side goes through without a vote.
    m.w = m.a ?? m.b;
    advance(state);
  }
  state.deadline = null;
  return state;
}

function advance(state: BracketState) {
  const m = state.rounds[state.round][state.match];
  const next = state.rounds[state.round + 1];
  if (!next) {
    state.winner = m.w;
    return;
  }
  const slot = next[Math.floor(state.match / 2)];
  if (state.match % 2 === 0) slot.a = m.w;
  else slot.b = m.w;
  if (state.match + 1 < state.rounds[state.round].length) state.match += 1;
  else {
    state.round += 1;
    state.match = 0;
  }
}

export function currentMatch(state: BracketState): Match | null {
  return state.winner ? null : state.rounds[state.round][state.match];
}

/** Closes the current match with the given tally. `rand` in [0,1) decides ties. */
export function closeMatch(prev: BracketState, tally: { a: number; b: number }, rand: number, now: number): BracketState {
  const state: BracketState = structuredClone(prev);
  const m = currentMatch(state);
  if (!m || !m.a || !m.b) return state;
  m.votes = tally;
  m.w = tally.a > tally.b ? m.a : tally.b > tally.a ? m.b : rand < 0.5 ? m.a : m.b;
  advance(state);
  return settle(state, now);
}

/** "final" | "semi" | "quarter", from how many matches the current round has. */
export function roundName(state: BracketState): "final" | "semi" | "quarter" {
  const n = state.rounds[state.round]?.length ?? 1;
  return n === 1 ? "final" : n === 2 ? "semi" : "quarter";
}

/** Number of real (non-bye) matches, for "match 2 of 7". */
export function matchProgress(state: BracketState) {
  let total = 0;
  let done = 0;
  state.rounds.forEach((round, r) =>
    round.forEach((m, k) => {
      const isBye = r === 0 && (!m.a || !m.b);
      if (isBye) return;
      total += 1;
      const before = r < state.round || (r === state.round && k < state.match);
      if (before || state.winner) done += 1;
    }),
  );
  return { done, total };
}

/* ───────────── Tavolo ───────────── */

export function initTable(now: number): TableState {
  return { kind: "table", deadline: now + TABLE_MS, scores: null, winner: null };
}

export function validBallot(ballot: Ballot, candidates: string[]) {
  const ids = new Set(candidates);
  const spent = Object.entries(ballot.dots).reduce((sum, [id, n]) => {
    if (!ids.has(id) || !Number.isInteger(n) || n < 0) return Infinity;
    return sum + n;
  }, 0);
  return spent === DOTS && (ballot.veto === null || ids.has(ballot.veto));
}

export function closeTable(prev: TableState, candidates: string[], ballots: Ballot[], rand: number): TableState {
  const scores: TableScore[] = candidates.map((mediaId) => ({
    mediaId,
    dots: ballots.reduce((s, b) => s + (b.dots[mediaId] ?? 0), 0),
    vetoed: ballots.some((b) => b.veto === mediaId),
  }));
  const eligible = scores.some((s) => !s.vetoed) ? scores.filter((s) => !s.vetoed) : scores;
  const top = Math.max(...eligible.map((s) => s.dots));
  const tied = eligible.filter((s) => s.dots === top);
  const winner = tied[Math.min(tied.length - 1, Math.floor(rand * tied.length))].mediaId;
  return { ...prev, deadline: null, scores: scores.sort((x, y) => y.dots - x.dots), winner };
}
