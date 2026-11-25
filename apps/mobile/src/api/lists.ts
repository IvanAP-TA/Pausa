import type { CandidateDto, IdOnly, ListDetail, ListItemAdded, ListSummary, MediaDetailDto } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";

const e = encodeURIComponent;

export type NewListInput = { name: string; kind?: "watchlist" | "list"; description?: string | null; circleId?: string | null };
export type AddItemInput = ({ mediaId: string } | { mediaKey: string }) & { note?: string | null; priority?: number };
export type ItemPatch = { note?: string | null; priority?: number };

export const LIST_CAP = 200;

export function listsEndpoints(c: Client) {
  return {
    overview: (circleId?: string | null, signal?: AbortSignal) => c.json<ListSummary[]>("GET", `/api/lists${circleId ? `?circle=${e(circleId)}` : ""}`, { signal }),
    create: (input: NewListInput) => c.json<IdOnly>("POST", "/api/lists", { body: input }),
    detail: (id: string, locale: string, signal?: AbortSignal) => c.json<ListDetail>("GET", `/api/lists/${e(id)}?locale=${e(locale)}`, { signal }),
    update: (id: string, input: { name?: string; description?: string | null }) => c.none("PATCH", `/api/lists/${e(id)}`, { body: input }),
    remove: (id: string) => c.none("DELETE", `/api/lists/${e(id)}`),
    addItem: (id: string, input: AddItemInput) => c.json<ListItemAdded>("POST", `/api/lists/${e(id)}/items`, { body: input }),
    editItem: (id: string, mediaId: string, patch: ItemPatch) => c.none("PATCH", `/api/lists/${e(id)}/items/${e(mediaId)}`, { body: patch }),
    removeItem: (id: string, mediaId: string) => c.none("DELETE", `/api/lists/${e(id)}/items/${e(mediaId)}`),
    /** The whole order in one call: every title of the list exactly once. */
    reorder: (id: string, mediaIds: string[]) => c.none("PUT", `/api/lists/${e(id)}/order`, { body: { mediaIds } }),
    duplicate: (id: string, input: { name?: string; circleId?: string | null } = {}) => c.json<IdOnly>("POST", `/api/lists/${e(id)}/duplicate`, { body: input }),
    /** The title behind `?add=<mediaId>`, to say what is being added. */
    media: (id: string, locale: string, signal?: AbortSignal) => c.json<MediaDetailDto>("GET", `/api/media/${e(id)}?locale=${e(locale)}`, { signal }),
    search: (q: string, locale: string, signal?: AbortSignal) => c.json<CandidateDto[]>("GET", `/api/media/search?q=${e(q)}&locale=${e(locale)}`, { signal }),
  };
}
export const listsApi = listsEndpoints(client);
