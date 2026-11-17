import { describe, expect, it } from "vitest";
import { buildSentryRequest, parseDsn } from "./sentry";

describe("parseDsn", () => {
  it("reads key, host and project", () => {
    expect(parseDsn("https://abc123@o1234.ingest.sentry.io/4567")).toEqual({ key: "abc123", host: "o1234.ingest.sentry.io", projectId: "4567", protocol: "https" });
  });
  it("rejects nonsense", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://o1.ingest.sentry.io/")).toBeNull(); // no key, no project
  });
});

describe("buildSentryRequest", () => {
  const dsn = parseDsn("https://abc123@o1234.ingest.sentry.io/4567")!;
  const now = new Date("2026-12-01T12:00:00Z");

  it("builds the envelope for an Error", () => {
    const { url, init } = buildSentryRequest(dsn, new TypeError("boom"), { path: "/it/c/x?code=SECRET", method: "GET", route: "/[locale]/c/[circleId]", kind: "render" }, now, "e".repeat(32));
    expect(url).toBe("https://o1234.ingest.sentry.io/api/4567/envelope/");
    expect(init.headers["x-sentry-auth"]).toContain("sentry_key=abc123");
    const [header, item, payload] = init.body.split("\n").map((l) => JSON.parse(l));
    expect(header.event_id).toBe("e".repeat(32));
    expect(item).toEqual({ type: "event" });
    expect(payload.exception.values[0]).toMatchObject({ type: "TypeError", value: "boom" });
    expect(payload.tags).toEqual({ route: "/[locale]/c/[circleId]", kind: "render" });
  });

  it("never sends the query string", () => {
    const { init } = buildSentryRequest(dsn, new Error("x"), { path: "/it/join?code=SECRET", method: "GET" }, now);
    expect(init.body).not.toContain("SECRET");
  });

  it("copes with a thrown string or nothing useful", () => {
    expect(JSON.parse(buildSentryRequest(dsn, "oops", {}, now).init.body.split("\n")[2]).exception.values[0].value).toBe("oops");
    expect(JSON.parse(buildSentryRequest(dsn, undefined, {}, now).init.body.split("\n")[2]).exception.values[0].value).toBe("Unknown error");
  });
});
