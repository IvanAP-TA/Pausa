import type { BulkDayDto, BulkDayUndone, ChunkResult, ImportConfig, IdOnly, ImportBatchDto, ImportUndone, ListChunkResult } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";

const e = encodeURIComponent;

/** One row as the server takes it (a subset of what the parsers produce: extra fields would be ignored, not sent). */
export type WireRow = {
  kind: "movie" | "tv" | "anime";
  title: string;
  year: number | null;
  rating: number | null;
  watchedOn: string | null;
  rewatch: boolean;
  review: string | null;
  letterboxdUri: string | null;
  anilistId: number | null;
  malId: number | null;
  tmdbId: number | null;
  imdbId: string | null;
};
export type StartImportInput = { source: string; circleId?: string | null; total?: number | null };
export type RowsInput = { rows: WireRow[]; offset: number; includeReviews: boolean; includeUndated: boolean; locale: string };
export type ListRowsInput = { name: string; description: string | null; kind: "watchlist" | "list"; offset: number; rows: WireRow[]; locale: string };

export function importEndpoints(c: Client) {
  return {
    start: (input: StartImportInput) => c.json<IdOnly>("POST", "/api/imports", { body: input }),
    rows: (id: string, input: RowsInput, signal?: AbortSignal) => c.json<ChunkResult>("POST", `/api/imports/${e(id)}/rows`, { body: input, signal }),
    lists: (id: string, input: ListRowsInput, signal?: AbortSignal) => c.json<ListChunkResult>("POST", `/api/imports/${e(id)}/lists`, { body: input, signal }),
    finish: (id: string, how: { cancel?: boolean; failed?: boolean } = {}) => c.json<ImportBatchDto>("POST", `/api/imports/${e(id)}/finish`, { body: how }),
    list: (signal?: AbortSignal) => c.json<ImportBatchDto[]>("GET", "/api/imports", { signal }),
    config: (signal?: AbortSignal) => c.json<ImportConfig>("GET", "/api/imports/config", { signal }),
    status: (id: string, signal?: AbortSignal) => c.json<ImportBatchDto>("GET", `/api/imports/${e(id)}`, { signal }),
    removeFromCircle: (id: string) => c.json<ImportUndone>("POST", `/api/imports/${e(id)}/remove-from-circle`, { body: {} }),
    remove: (id: string, withLists: boolean) => c.json<ImportUndone>("DELETE", `/api/imports/${e(id)}${withLists ? "?lists=1" : ""}`),
    bulkDays: (signal?: AbortSignal) => c.json<BulkDayDto[]>("GET", "/api/imports/bulk-days", { signal }),
    hideBulkDay: (day: string) => c.json<BulkDayUndone>("POST", `/api/imports/bulk-days/${e(day)}/hide`, { body: {} }),
    deleteBulkDay: (day: string) => c.json<BulkDayUndone>("DELETE", `/api/imports/bulk-days/${e(day)}`),
  };
}
export const importApi = importEndpoints(client);
