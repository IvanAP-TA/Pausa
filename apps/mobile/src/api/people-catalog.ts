import type { PersonHitDto, PersonPageDto } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";
import { query } from "./diary";

const e = encodeURIComponent;

export function peopleCatalogEndpoints(c: Client) {
  return {
    search: (q: string, locale: string, signal?: AbortSignal) => c.json<PersonHitDto[]>("GET", `/api/people/search${query({ q, locale })}`, { signal }),
    person: (key: string, o: { locale: string; circle?: string }, signal?: AbortSignal) => c.json<PersonPageDto>("GET", `/api/people/${e(key)}${query({ ...o })}`, { signal }),
  };
}
export const peopleCatalogApi = peopleCatalogEndpoints(client);
