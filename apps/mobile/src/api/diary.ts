import type {
  CandidateDto,
  IdOnly,
  LogCreated,
  LogPage,
  LogThread,
  MediaDetailDto,
  NotificationPage,
  Position,
  ProgressDto,
  ReactionToggled,
  Removed,
} from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";

const e = encodeURIComponent;

/** `?a=1&b=x`, leaving out what is undefined, null, empty or false (true becomes `1`). */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)
    .map(([k, v]) => `${e(k)}=${e(v === true ? "1" : String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** What a client sends to write a viewing (request bodies are not part of the generated response contract). */
export type LogInput = {
  watchedOn: string;
  /** Half stars, 1..10; omitted = not rated. */
  rating?: number | null;
  review?: string | null;
  platform?: string | null;
  season?: number | null;
  episode?: number | null;
  containsSpoilers?: boolean;
  isRewatch?: boolean;
  watchedWith?: string[];
};
export type NewLogInput = LogInput & { mediaKey: string; circles: string[]; locale?: string };

export type FeedFilters = { person?: string; kind?: "movie" | "tv" | "anime"; year?: number; platform?: string; minRating?: number };

export const REACTIONS = ["😭", "🍿", "❤️", "😂", "🤯"] as const;
export const REPORT_REASONS = ["abuse", "spam", "privacy", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function diaryEndpoints(c: Client) {
  return {
    searchMedia: (q: string, locale: string, signal?: AbortSignal) => c.json<CandidateDto[]>("GET", `/api/media/search${query({ q, locale })}`, { signal }),
    media: (id: string, locale: string, signal?: AbortSignal) => c.json<MediaDetailDto>("GET", `/api/media/${e(id)}${query({ locale })}`, { signal }),

    /** `idempotencyKey` is sent as `Idempotency-Key`: the offline outbox repeats a request whose answer it never saw (see src/offline/outbox.ts). */
    createLog: (input: NewLogInput, idempotencyKey?: string) => c.json<LogCreated>("POST", "/api/logs", { body: input, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined }),
    updateLog: (id: string, input: LogInput) => c.none("PUT", `/api/logs/${e(id)}`, { body: input }),
    deleteLog: (id: string) => c.none("DELETE", `/api/logs/${e(id)}`),
    setShares: (id: string, circles: string[]) => c.none("PUT", `/api/logs/${e(id)}/shares`, { body: { circles } }),

    feed: (circleId: string, o: FeedFilters & { before?: string | null; locale: string }, signal?: AbortSignal) =>
      c.json<LogPage>("GET", `/api/circles/${e(circleId)}/feed${query({ ...o })}`, { signal }),
    diary: (o: { before?: string | null; locale: string }, signal?: AbortSignal) => c.json<LogPage>("GET", `/api/me/diary${query({ ...o })}`, { signal }),
    thread: (circleId: string, logId: string, o: { reveal?: boolean; locale: string }, signal?: AbortSignal) =>
      c.json<LogThread>("GET", `/api/circles/${e(circleId)}/logs/${e(logId)}${query({ reveal: o.reveal, locale: o.locale })}`, { signal }),

    react: (circleId: string, logId: string, emoji: string) => c.json<ReactionToggled>("POST", `/api/circles/${e(circleId)}/logs/${e(logId)}/reactions`, { body: { emoji } }),
    addComment: (circleId: string, logId: string, input: { body: string; isSpoiler?: boolean; parentId?: string | null }) =>
      c.json<IdOnly>("POST", `/api/circles/${e(circleId)}/logs/${e(logId)}/comments`, { body: input }),
    editComment: (id: string, input: { body: string; isSpoiler?: boolean }) => c.none("PATCH", `/api/comments/${e(id)}`, { body: input }),
    deleteComment: (id: string) => c.none("DELETE", `/api/comments/${e(id)}`),
    report: (input: { kind: "log" | "comment"; targetId: string; reason: ReportReason; note?: string }) => c.none("POST", "/api/reports", { body: input }),
    withdraw: (circleId: string, confirm: string) => c.json<Removed>("POST", `/api/circles/${e(circleId)}/withdraw`, { body: { confirm } }),

    progress: (locale: string, signal?: AbortSignal) => c.json<ProgressDto[]>("GET", `/api/me/progress${query({ locale })}`, { signal }),
    setProgress: (mediaId: string, input: { season?: number; episode?: number; status?: "watching" | "paused" | "done" }) =>
      c.none("PUT", `/api/media/${e(mediaId)}/progress`, { body: input }),
    advance: (mediaId: string, season = false) => c.json<Position>("POST", `/api/media/${e(mediaId)}/progress/advance`, { body: season ? { season: true } : {} }),
    clearProgress: (mediaId: string) => c.none("DELETE", `/api/media/${e(mediaId)}/progress`),

    notifications: (o: { circle?: string; before?: string | null; locale: string }, signal?: AbortSignal) =>
      c.json<NotificationPage>("GET", `/api/notifications${query({ ...o })}`, { signal }),
    markRead: (circleId?: string) => c.none("POST", "/api/notifications/read", { body: circleId ? { circleId } : {} }),
  };
}
export const diaryApi = diaryEndpoints(client);
