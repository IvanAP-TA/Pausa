import type { Ballot, CandidateDto, CircleServices, LogPage, Mode, NativeToken, Recommendation, RoomView, SerataCreated, SerataPublicResult, SerataSuggest, SerataSummary } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";

const e = encodeURIComponent;

/** The eight guest pictures the server accepts (`GUEST_AVATARS` in crates/core); anything else is ignored there. */
export const GUEST_AVATARS = ["🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢"] as const;

export type CreateSerataInput = { circleId: string; mode: Mode; mediaKeys: string[] };
export type JoinInput = { name?: string; avatar?: string };

/** Everything the Serata screens call. Request bodies are typed here (the generated contract only has responses). */
export function serataEndpoints(c: Client) {
  return {
    create: (input: CreateSerataInput) => c.json<SerataCreated>("POST", "/api/serate", { body: input }),
    room: (code: string, signal?: AbortSignal) => c.json<RoomView>("GET", `/api/serate/${e(code)}`, { signal }),
    join: (code: string, input: JoinInput = {}) => c.json<RoomView>("POST", `/api/serate/${e(code)}/join`, { body: input }),
    /** A share leaves no trace otherwise: the operator metrics count it (once per person per Serata). Never throws. */
    track: (code: string, name: "card_shared" | "invite_shared") => c.none("POST", `/api/serate/${e(code)}/events`, { body: { name } }).catch(() => undefined),
    start: (code: string) => c.json<RoomView>("POST", `/api/serate/${e(code)}/start`, { body: {} }),
    vote: (code: string, mediaId: string) => c.json<RoomView>("POST", `/api/serate/${e(code)}/vote`, { body: { mediaId } }),
    ballot: (code: string, ballot: Ballot) => c.json<RoomView>("POST", `/api/serate/${e(code)}/ballot`, { body: ballot }),
    force: (code: string) => c.json<RoomView>("POST", `/api/serate/${e(code)}/force`, { body: {} }),
    leave: (code: string) => c.json<RoomView>("POST", `/api/serate/${e(code)}/leave`, { body: {} }),
    repeat: (code: string) => c.json<SerataCreated>("POST", `/api/serate/${e(code)}/repeat`, { body: {} }),
    watched: (code: string, logId: string) => c.none("POST", `/api/serate/${e(code)}/watched`, { body: { logId } }),
    publicResult: (code: string, signal?: AbortSignal) => c.json<SerataPublicResult>("GET", `/api/serate/${e(code)}/result`, { signal, auth: false }),
    history: (circleId: string, limit = 20, signal?: AbortSignal) => c.json<SerataSummary[]>("GET", `/api/circles/${e(circleId)}/serate?limit=${limit}`, { signal }),

    /** What the Cerchia can stream together (the services every member who set theirs has). */
    services: (circleId: string, signal?: AbortSignal) => c.json<CircleServices>("GET", `/api/circles/${e(circleId)}/serate/services`, { signal }),
    /** "Fill the roster for us": a roster the group would want, and which shared services carry each title. */
    suggest: (circleId: string, locale: string, signal?: AbortSignal) => c.json<SerataSuggest>("GET", `/api/circles/${e(circleId)}/serate/suggest?locale=${e(locale)}`, { signal }),

    /** An anonymous account for a guest. `native: true` answers with a Bearer token instead of setting the cookie. */
    guest: (name: string, native: boolean) => c.json<{ ok: true } | NativeToken>("POST", "/api/auth/guest", { body: { name, native }, auth: false }),

    // Where the candidates come from.
    search: (q: string, locale: string, signal?: AbortSignal) => c.json<CandidateDto[]>("GET", `/api/media/search?q=${e(q)}&locale=${e(locale)}`, { signal }),
    recommendations: (circleId: string, locale: string, limit = 12, signal?: AbortSignal) =>
      c.json<Recommendation[]>("GET", `/api/circles/${e(circleId)}/recommendations?limit=${limit}&locale=${e(locale)}`, { signal }),
    myDiary: (locale: string, before?: string | null, signal?: AbortSignal) =>
      c.json<LogPage>("GET", `/api/me/diary?locale=${e(locale)}${before ? `&before=${e(before)}` : ""}`, { signal }),
  };
}
export const serataApi = serataEndpoints(client);
