import type { ForYou, Insights, RankingPage, Recommendation } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";
import { query } from "./diary";

const e = encodeURIComponent;

export type RankingSort = "avg" | "votes" | "year" | "recent" | "title";
export type RankingQuery = {
  q?: string;
  kind?: "movie" | "tv" | "anime";
  yearFrom?: number;
  yearTo?: number;
  minVotes?: number;
  everyone?: boolean;
  by?: string;
  sort?: RankingSort;
  page?: number;
};

export function statsEndpoints(c: Client) {
  return {
    ranking: (circleId: string, o: RankingQuery & { locale: string }, signal?: AbortSignal) =>
      c.json<RankingPage>("GET", `/api/circles/${e(circleId)}/ranking${query({ ...o })}`, { signal }),
    insights: (circleId: string, o: { year?: number; locale: string }, signal?: AbortSignal) =>
      c.json<Insights>("GET", `/api/circles/${e(circleId)}/insights${query({ ...o })}`, { signal }),
    recommendations: (circleId: string, o: { limit?: number; locale: string }, signal?: AbortSignal) =>
      c.json<Recommendation[]>("GET", `/api/circles/${e(circleId)}/recommendations${query({ ...o })}`, { signal }),
    forYou: (o: { locale: string }, signal?: AbortSignal) => c.json<ForYou>("GET", `/api/me/for-you${query({ ...o })}`, { signal }),
  };
}
export const statsApi = statsEndpoints(client);
