import type { Ballot, RoomView } from "@pausa/api-types";

/** Pure rules of the room screen: what the client may decide on its own (never when a round closes: that is the server's clock). */

/** A pushed view replaces the one we have unless it is older (a late poll answer arriving after a WebSocket push). */
export function newer(current: RoomView | null, next: RoomView): RoomView {
  return current && next.version < current.version ? current : next;
}

/** `serverNow - clientNow`: add it to the device clock to read the server's. Taken from every view that arrives. */
export const clockOffset = (view: Pick<RoomView, "serverNow">, deviceNow = Date.now()) => view.serverNow - deviceNow;

/** Whole seconds left until a server deadline, never negative; `null` when there is no deadline. */
export function secondsLeft(deadline: number | null, offsetMs: number, deviceNow = Date.now()): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (deviceNow + offsetMs)) / 1000));
}

/** 0..1 of the round that is gone, for the bar. `durationMs` is the length the round had when it started. */
export function elapsedShare(deadline: number | null, offsetMs: number, durationMs: number, deviceNow = Date.now()): number {
  if (deadline === null || durationMs <= 0) return 0;
  const left = deadline - (deviceNow + offsetMs);
  return Math.min(1, Math.max(0, 1 - left / durationMs));
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** "Match 2 of 7": the one being voted is `done + 1`, never past the total. */
export const matchNumber = (b: { done: number; total: number }) => ({ n: Math.min(b.done + 1, b.total), total: b.total });

/** The vote shown at once, before the server answers: my pick on the match, and me marked as having voted. */
export function withPick(view: RoomView, meId: string, mediaId: string): RoomView {
  if (!view.bracket) return view;
  return {
    ...view,
    bracket: { ...view.bracket, myPick: mediaId },
    participants: view.participants.map((p) => (p.id === meId ? { ...p, voted: true } : p)),
  };
}

export function withBallot(view: RoomView, meId: string, ballot: Ballot): RoomView {
  if (!view.table) return view;
  return {
    ...view,
    table: { ...view.table, myBallot: ballot },
    participants: view.participants.map((p) => (p.id === meId ? { ...p, voted: true } : p)),
  };
}

export type BallotProblem = "dots" | "unknown" | "veto";

/** Same rule as the server: every key a candidate, whole non-negative numbers, exactly `dots` in total; a veto is null or a candidate. */
export function ballotProblem(ballot: Ballot, candidateIds: string[], dots: number): BallotProblem | null {
  const ids = new Set(candidateIds);
  let sum = 0;
  for (const [id, n] of Object.entries(ballot.dots)) {
    if (!ids.has(id)) return "unknown";
    if (!Number.isInteger(n) || n < 0) return "dots";
    sum += n;
  }
  if (sum !== dots) return "dots";
  if (ballot.veto !== null && !ids.has(ballot.veto)) return "veto";
  return null;
}

export const dotsLeft = (placed: Record<string, number>, dots: number) => dots - Object.values(placed).reduce((a, b) => a + b, 0);

/** Only the non-zero entries go to the server. */
export function cleanBallot(placed: Record<string, number>, veto: string | null): Ballot {
  return { dots: Object.fromEntries(Object.entries(placed).filter(([, n]) => n > 0)), veto };
}

/** `ws://host/api/serate/CODE/ws` from the API origin ("" = the page's own origin on web). */
export function socketUrl(apiOrigin: string, pageOrigin: string | null, code: string): string {
  const origin = apiOrigin || pageOrigin || "";
  return `${origin.replace(/^http/, "ws")}/api/serate/${encodeURIComponent(code)}/ws`;
}

/** Wait before the n-th reconnect: 1 s, 2 s, 4 s, then 8 s at most. */
export const backoffMs = (attempt: number) => Math.min(8000, 1000 * 2 ** Math.max(0, attempt));

/** The invite link of a room, for sharing. */
export const roomLink = (origin: string, locale: string, code: string) => `${origin}/${locale}/s/${code}`;

/** Normalises what a person types or pastes as a code (or a whole link) into the 6-character code. */
export function codeFrom(input: string): string {
  const last = input.trim().split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() ?? "";
  return last.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** The two candidates of the current match, in order, resolved from the candidate list. */
export function matchPair(view: RoomView) {
  const b = view.bracket;
  if (!b || !b.a || !b.b) return null;
  const a = view.candidates.find((c) => c.id === b.a);
  const c = view.candidates.find((x) => x.id === b.b);
  return a && c ? { a, b: c } : null;
}
