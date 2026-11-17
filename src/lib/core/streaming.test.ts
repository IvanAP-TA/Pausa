import { beforeEach, describe, expect, it } from "vitest";
import { mediaEntity } from "../../db/schema";
import type { AnyDb } from "./db-types";
import {
  AVAILABILITY_TTL_MS, commonProviders, getAvailability, getUserProviders, onServices, parseRegionProviders, parseWatchProviders,
  setUserProviders, storeAvailability, type Provider,
} from "./streaming";
import { createTestDb, seedUsers } from "./test-db";

const nf: Provider = { id: 8, name: "Netflix", logoPath: "/n.jpg" };
const prime: Provider = { id: 119, name: "Prime Video", logoPath: "/p.jpg" };
const disney: Provider = { id: 337, name: "Disney Plus", logoPath: null };

describe("parsing TMDB", () => {
  it("keeps flat-rate services for the country, in display order", () => {
    const json = { results: { IT: { flatrate: [
      { provider_id: 119, provider_name: "Prime Video", logo_path: "/p.jpg", display_priority: 5 },
      { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg", display_priority: 1 },
    ], rent: [{ provider_id: 2, provider_name: "Apple" }] }, US: { flatrate: [{ provider_id: 15, provider_name: "Hulu" }] } } };
    expect(parseWatchProviders(json, "IT").map((p) => p.name)).toEqual(["Netflix", "Prime Video"]);
    expect(parseWatchProviders(json, "FR")).toEqual([]);
    expect(parseWatchProviders(null, "IT")).toEqual([]);
  });

  it("orders a region's catalogue by its priority there and caps it", () => {
    const json = { results: [
      { provider_id: 1, provider_name: "B", display_priorities: { IT: 2 } },
      { provider_id: 2, provider_name: "A", display_priorities: { IT: 1 } },
      { provider_id: 3, provider_name: "C", display_priority: 9 },
    ] };
    expect(parseRegionProviders(json, "IT").map((p) => p.name)).toEqual(["A", "B", "C"]);
    expect(parseRegionProviders(json, "IT", 2)).toHaveLength(2);
  });
});

describe("common services", () => {
  it("is the intersection of the people who set theirs", () => {
    expect(commonProviders([[nf, prime], [prime, disney], [prime]]).map((p) => p.name)).toEqual(["Prime Video"]);
    expect(commonProviders([[nf, prime], [disney]])).toEqual([]);
  });
  it("ignores people who set none, and is empty when nobody did", () => {
    expect(commonProviders([[nf, prime], [], [nf]]).map((p) => p.name)).toEqual(["Netflix"]);
    expect(commonProviders([[], []])).toEqual([]);
    expect(commonProviders([])).toEqual([]);
  });
  it("onServices says which wanted services carry a title", () => {
    expect(onServices([nf, disney], [prime, nf]).map((p) => p.name)).toEqual(["Netflix"]);
    expect(onServices(undefined, [nf])).toEqual([]);
  });
});

describe("storage", () => {
  let db: AnyDb;
  beforeEach(async () => {
    db = await createTestDb();
    await seedUsers(db, ["Ann", "Bob"]);
    await db.insert(mediaEntity).values([{ id: "m1", kind: "movie", originalTitle: "A", tmdbId: 1 }, { id: "m2", kind: "movie", originalTitle: "B", tmdbId: 2 }]);
  });

  it("saves a person's services and replaces them on the next save", async () => {
    await setUserProviders(db, { userId: "u-ann", country: "IT", providers: [nf, prime, nf] });
    expect((await getUserProviders(db, ["u-ann", "u-bob"])).get("u-ann")!.map((p) => p.id).sort((a, b) => a - b)).toEqual([8, 119]);
    await setUserProviders(db, { userId: "u-ann", country: "ES", providers: [disney] });
    const got = await getUserProviders(db, ["u-ann", "u-bob"]);
    expect(got.get("u-ann")).toEqual([disney]);
    expect(got.get("u-bob")).toEqual([]);
  });

  it("remembers availability, including 'nowhere', until the TTL runs out", async () => {
    const t0 = new Date("2026-11-17T10:00:00Z");
    await storeAvailability(db, { mediaId: "m1", country: "IT", providers: [nf, prime], now: t0 });
    await storeAvailability(db, { mediaId: "m2", country: "IT", providers: [], now: t0 });
    const soon = new Date(t0.getTime() + 86_400_000);
    const a = await getAvailability(db, ["m1", "m2"], "IT", soon);
    expect(a.stale).toEqual([]);
    expect(a.known.get("m1")!.map((p) => p.id).sort((a, b) => a - b)).toEqual([8, 119]);
    expect(a.known.get("m2")).toEqual([]); // looked up, on no service: not stale
    const later = new Date(t0.getTime() + AVAILABILITY_TTL_MS + 1);
    expect((await getAvailability(db, ["m1", "m2"], "IT", later)).stale.sort()).toEqual(["m1", "m2"]);
  });

  it("keeps countries apart and refreshes in place", async () => {
    await storeAvailability(db, { mediaId: "m1", country: "IT", providers: [nf] });
    expect((await getAvailability(db, ["m1"], "ES")).stale).toEqual(["m1"]);
    await storeAvailability(db, { mediaId: "m1", country: "IT", providers: [disney] });
    expect((await getAvailability(db, ["m1"], "IT")).known.get("m1")).toEqual([disney]);
  });
});
