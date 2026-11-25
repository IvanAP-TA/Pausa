import type { MySettings, PersonProfile } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";
import { query } from "./diary";

const e = encodeURIComponent;

export type ProfileInput = { name: string; bio?: string; genres?: string[]; /** An emoji from the list, "none" for the initial, "" to keep. */ avatar?: string };
export type SettingsInput = { locale?: string; country?: string; emailDigest?: boolean; notifyOff?: string[] };

/** The lists the server accepts (crates/core/src/profile.rs): genre keys, avatars (the first 8 are the guest ones), countries, notification types. */
export const GENRES = ["action", "adventure", "animation", "anime", "comedy", "crime", "documentary", "drama", "family", "fantasy", "history", "horror", "musical", "mystery", "romance", "scifi", "thriller", "war", "western"] as const;
export const AVATARS = ["🦊", "🐙", "🦉", "🐸", "🦄", "🐧", "🦋", "🐢", "🍿", "🎬", "📼", "🎞️", "👽", "🤖", "🧛", "🦖", "🐱", "🐶", "🦁", "🐼", "🌙", "🌵", "🍕", "🍩"] as const;
export const COUNTRIES = ["IT", "GB", "US", "ES", "FR", "DE", "PT", "NL", "BE", "CH", "AT", "IE", "CA", "AU", "BR"] as const;
export const NOTIFICATION_TYPES = ["log", "comment", "reaction", "now_watching", "serata_invite", "circle_join", "mention"] as const;
export const MAX_GENRES = 5;
export const MAX_FAVORITES = 5;
export const MAX_BIO = 280;

export function peopleEndpoints(c: Client) {
  return {
    settings: (signal?: AbortSignal) => c.json<MySettings>("GET", "/api/me/settings", { signal }),
    saveProfile: (input: ProfileInput) => c.none("PUT", "/api/me/profile", { body: input }),
    saveSettings: (input: SettingsInput) => c.none("PUT", "/api/me/settings", { body: input }),
    addFavorite: (mediaId: string) => c.none("POST", "/api/me/favorites", { body: { mediaId } }),
    removeFavorite: (mediaId: string) => c.none("DELETE", `/api/me/favorites/${e(mediaId)}`),
    circleMe: (circleId: string, input: { muted?: boolean; hideWatching?: boolean }) => c.none("PUT", `/api/circles/${e(circleId)}/me`, { body: input }),
    person: (circleId: string, userId: string, locale: string, signal?: AbortSignal) =>
      c.json<PersonProfile>("GET", `/api/circles/${e(circleId)}/people/${e(userId)}${query({ locale })}`, { signal }),
  };
}
export const peopleApi = peopleEndpoints(client);
