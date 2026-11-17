import { beforeEach, describe, expect, it } from "vitest";
import { mediaEntity } from "../../db/schema";
import type { AnyDb } from "./db-types";
import {
  DETAILS_TTL_MS, advance, clampPosition, getEpisodeInfo, isStale, limitsOf, maxEpisode, parseAniListEpisodes, parseTmdbSeasons, storeEpisodeInfo, type EpisodeInfo,
} from "./episodes";
import { createTestDb } from "./test-db";

const info = (seasons: [number, number][], total: number | null = null): EpisodeInfo => ({ seasons: new Map(seasons), total, checkedAt: null });
const show = info([[1, 10], [2, 8], [3, 6]]);

describe("parsing", () => {
  it("TMDB: drops specials and empty seasons, sorts", () => {
    const json = { seasons: [{ season_number: 2, episode_count: 8 }, { season_number: 0, episode_count: 5 }, { season_number: 1, episode_count: 10 }, { season_number: 3, episode_count: 0 }, { season_number: 4 }] };
    expect(parseTmdbSeasons(json)).toEqual([{ season: 1, episodes: 10 }, { season: 2, episodes: 8 }]);
    expect(parseTmdbSeasons(null)).toEqual([]);
  });

  it("AniList: the total when known, what has aired while it is still running", () => {
    expect(parseAniListEpisodes({ data: { Media: { episodes: 24, nextAiringEpisode: null } } })).toBe(24);
    expect(parseAniListEpisodes({ data: { Media: { episodes: null, nextAiringEpisode: { episode: 8 } } } })).toBe(7);
    expect(parseAniListEpisodes({ data: { Media: { episodes: null, nextAiringEpisode: { episode: 1 } } } })).toBeNull();
    expect(parseAniListEpisodes({ data: { Media: null } })).toBeNull();
  });
});

describe("limits", () => {
  it("knows the highest episode of a season, or of an anime with no seasons", () => {
    expect(maxEpisode(show, 2)).toBe(8);
    expect(maxEpisode(show, 9)).toBeNull();
    expect(maxEpisode(info([], 24), null)).toBe(24);
    expect(maxEpisode(info([]), null)).toBeNull();
  });

  it("clamps to what exists and leaves unknown titles alone", () => {
    expect(clampPosition(show, { season: 2, episode: 50 })).toEqual({ season: 2, episode: 8 });
    expect(clampPosition(show, { season: 9, episode: 3 })).toEqual({ season: 3, episode: 3 });
    expect(clampPosition(info([]), { season: 4, episode: 400 })).toEqual({ season: 4, episode: 400 });
    expect(clampPosition(info([], 12), { season: null, episode: 99 })).toEqual({ season: null, episode: 12 });
  });
});

describe("advance", () => {
  it("adds one inside a season", () => {
    expect(advance(show, { season: 1, episode: 4 })).toEqual({ season: 1, episode: 5 });
  });
  it("rolls over to the next season at the end of one", () => {
    expect(advance(show, { season: 1, episode: 10 })).toEqual({ season: 2, episode: 1 });
    expect(advance(show, { season: 2, episode: 8 })).toEqual({ season: 3, episode: 1 });
  });
  it("stays at the very end", () => {
    expect(advance(show, { season: 3, episode: 6 })).toEqual({ season: 3, episode: 6 });
    expect(advance(info([], 12), { season: null, episode: 12 })).toEqual({ season: null, episode: 12 });
  });
  it("without counts it only adds one, starting from nothing", () => {
    expect(advance(info([]), { season: 2, episode: 9 })).toEqual({ season: 2, episode: 10 });
    expect(advance(info([]), { season: null, episode: null })).toEqual({ season: null, episode: 1 });
  });
  it("skips a missing season number", () => {
    expect(advance(info([[1, 3], [3, 4]]), { season: 1, episode: 3 })).toEqual({ season: 3, episode: 1 });
  });
});

describe("storage", () => {
  let db: AnyDb;
  beforeEach(async () => { db = await createTestDb(); await db.insert(mediaEntity).values({ id: "m1", kind: "tv", originalTitle: "Show", tmdbId: 1 }); });

  it("stores and replaces seasons, records the check time, and expires after a month", async () => {
    const t0 = new Date("2026-12-01T00:00:00Z");
    expect(isStale(await getEpisodeInfo(db, "m1"), t0)).toBe(true); // never checked
    await storeEpisodeInfo(db, { mediaId: "m1", seasons: [{ season: 1, episodes: 10 }, { season: 2, episodes: 8 }], now: t0 });
    let got = await getEpisodeInfo(db, "m1");
    expect(limitsOf(got)).toEqual({ seasons: [{ season: 1, episodes: 10 }, { season: 2, episodes: 8 }], total: null });
    expect(isStale(got, new Date(t0.getTime() + 86_400_000))).toBe(false);
    expect(isStale(got, new Date(t0.getTime() + DETAILS_TTL_MS + 1))).toBe(true);
    await storeEpisodeInfo(db, { mediaId: "m1", seasons: [{ season: 1, episodes: 12 }], total: null, now: t0 });
    got = await getEpisodeInfo(db, "m1");
    expect([...got.seasons]).toEqual([[1, 12]]);
  });

  it("an anime with only a total", async () => {
    await storeEpisodeInfo(db, { mediaId: "m1", seasons: [], total: 24 });
    expect(maxEpisode(await getEpisodeInfo(db, "m1"), null)).toBe(24);
  });
});
