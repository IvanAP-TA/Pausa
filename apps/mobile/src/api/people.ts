import type { Availability, ForYou, MyProviders, MySettings, PersonProfile, Provider, ProviderCatalogue } from "@pausa/api-types";
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
    forYou: (locale: string, signal?: AbortSignal) => c.json<ForYou>("GET", `/api/me/for-you${query({ locale })}`, { signal }),
    providerCatalogue: (country: string, locale: string, signal?: AbortSignal) => c.json<ProviderCatalogue>("GET", `/api/providers${query({ country, locale })}`, { signal }),
    myProviders: (signal?: AbortSignal) => c.json<MyProviders>("GET", "/api/me/providers", { signal }),
    /** Where a title streams: TMDB services in your country, or AniList's streaming sites for an anime TMDB does not know. */
    availability: (mediaId: string, signal?: AbortSignal) => c.json<Availability>("GET", `/api/media/${encodeURIComponent(mediaId)}/availability`, { signal }),
    saveProviders: (country: string | null, providers: Provider[]) => c.none("PUT", "/api/me/providers", { body: { country, providers } }),
    /** The Web Push public key; 404 when this server has no VAPID keys (push is off). */
    pushKey: (signal?: AbortSignal) => c.json<{ publicKey: string }>("GET", "/api/push/key", { signal }),
    pushRegister: (input: { endpoint: string; p256dh: string; auth: string; locale: string }) => c.none("POST", "/api/me/push", { body: { kind: "webpush", ...input } }),
    pushUnregister: (endpoint: string) => c.none("DELETE", "/api/me/push", { body: { endpoint } }),
    person: (circleId: string, userId: string, locale: string, signal?: AbortSignal) =>
      c.json<PersonProfile>("GET", `/api/circles/${e(circleId)}/people/${e(userId)}${query({ locale })}`, { signal }),
  };
}
export const peopleApi = peopleEndpoints(client);
