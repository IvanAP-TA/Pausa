import { describe, expect, it, vi } from "vitest";
vi.mock("@/api", () => ({ client: {} }));
import { peopleCatalogEndpoints } from "@/api/people-catalog";

describe("people catalogue endpoints", () => {
  it("builds the URLs", async () => {
    const calls: string[] = [];
    const c = { json: async (_m: string, url: string) => (calls.push(url), []) } as never;
    const api = peopleCatalogEndpoints(c);
    await api.search("david simon", "it");
    await api.person("tmdb:1223786", { locale: "it", circle: "c1" });
    expect(calls).toEqual(["/api/people/search?q=david%20simon&locale=it", "/api/people/tmdb%3A1223786?locale=it&circle=c1"]);
  });
});
