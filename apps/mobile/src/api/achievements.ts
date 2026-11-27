import type { AchievementsDto, BoardDto, JoinBoardInput, PersonalStatsDto, PublicProfileDto } from "@pausa/api-types";
import { client } from "./index";
import type { Client } from "./client";

const e = encodeURIComponent;

/** Traguardi, the opt-in global board, the public profile page and the person's own statistics (crates/api/src/achievements.rs). */
export function achievementEndpoints(c: Client) {
  return {
    mine: (signal?: AbortSignal) => c.json<AchievementsDto>("GET", "/api/me/achievements", { signal }),
    join: (input: JoinBoardInput) => c.json<AchievementsDto>("PUT", "/api/me/leaderboard", { body: input }),
    leave: () => c.none("DELETE", "/api/me/leaderboard"),
    board: (period: "all" | "month", signal?: AbortSignal) => c.json<BoardDto>("GET", `/api/leaderboard?period=${period}`, { signal }),
    publicProfile: (handle: string, signal?: AbortSignal) => c.json<PublicProfileDto>("GET", `/api/u/${e(handle)}`, { auth: false, signal }),
    stats: (signal?: AbortSignal) => c.json<PersonalStatsDto>("GET", "/api/me/stats", { signal }),
  };
}
export const achievementsApi = achievementEndpoints(client);
