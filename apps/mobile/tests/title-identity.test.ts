import { describe, expect, it } from "vitest";
import { dedupeTitles, titleIdentity } from "@/features/title-identity";

const t = (key: string, title: string, year: number | null = 1999, kind = "movie") => ({ key, kind, title, year });

describe("one row per title", () => {
  it("the same film from Pausa's own titles and from the catalogue is one row, the stored one", () => {
    const rows = dedupeTitles([t("tmdb:movie:603", "Matrix"), t("tmdb:movie:1396", "Breaking Bad", 2008, "tv"), t("local:abc", "Matrix")]);
    expect(rows.map((r) => r.key)).toEqual(["local:abc", "tmdb:movie:1396"]);
  });
  it("keeps the order the server gave and tells titles apart by kind and year", () => {
    const rows = dedupeTitles([t("a", "Dune", 1984), t("b", "Dune", 2021), t("c", "Dune", 2021, "tv"), t("d", "dune ", 1984)]);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
  it("identity ignores case and spaces, and takes a bigint year as the API types it", () => {
    expect(titleIdentity({ kind: "movie", title: " Matrix ", year: BigInt(1999) })).toBe(titleIdentity(t("x", "matrix", 1999)));
    expect(titleIdentity(t("x", "Matrix", null))).toBe("movie|matrix|");
  });
});
