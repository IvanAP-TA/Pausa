import { describe, expect, it } from "vitest";
import { inviteCodeFrom, safeNext } from "../src/features/next";
import { legalContact } from "../src/features/public/legal-contact";
import { tintIndex } from "../src/ui/Poster-seed";

describe("safeNext: only a path inside this site is honoured", () => {
  const fb = "/it/home";
  it("keeps a plain path, with its query", () => {
    expect(safeNext("/it/c/abc", fb)).toBe("/it/c/abc");
    expect(safeNext("/it/join/ABCD2345?x=1", fb)).toBe("/it/join/ABCD2345?x=1");
  });
  it.each(["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "", "/ it", "/a b"])("refuses %j", (bad) => {
    expect(safeNext(bad, fb)).toBe(fb);
  });
  it("refuses undefined, and takes the first of an array", () => {
    expect(safeNext(undefined, fb)).toBe(fb);
    expect(safeNext(["/it/account", "//x"], fb)).toBe("/it/account");
  });
});

describe("inviteCodeFrom: a code or a whole link", () => {
  it("takes the code as typed, upper-cased and trimmed", () => {
    expect(inviteCodeFrom("  abcd2345 ")).toBe("ABCD2345");
  });
  it("takes the last path segment of a link, without query, hash or trailing slash", () => {
    expect(inviteCodeFrom("https://pausa.gnagno.org/it/join/ABCD2345")).toBe("ABCD2345");
    expect(inviteCodeFrom("https://pausa.gnagno.org/es/join/abcd2345/?utm=x#top")).toBe("ABCD2345");
  });
  it("drops anything that is not a letter or digit, and gives an empty string for nothing", () => {
    expect(inviteCodeFrom("ABCD-2345")).toBe("ABCD2345");
    expect(inviteCodeFrom("   ")).toBe("");
  });
});

describe("legalContact: build-time controller and contact", () => {
  it("is null for both when nothing is set (the page then shows a placeholder)", () => {
    expect(legalContact({})).toEqual({ entity: null, email: null });
    expect(legalContact({ LEGAL_ENTITY: "  ", CONTACT_EMAIL: "" })).toEqual({ entity: null, email: null });
  });
  it("reads LEGAL_ENTITY and CONTACT_EMAIL, trimmed, and accepts the EXPO_PUBLIC_ spelling", () => {
    expect(legalContact({ LEGAL_ENTITY: " Ada Srl ", CONTACT_EMAIL: "a@b.it" })).toEqual({ entity: "Ada Srl", email: "a@b.it" });
    expect(legalContact({ EXPO_PUBLIC_LEGAL_ENTITY: "X", EXPO_PUBLIC_CONTACT_EMAIL: "x@y.z" })).toEqual({ entity: "X", email: "x@y.z" });
  });
});

describe("tintIndex: the same name always gets the same dye, and the eight dyes are all used", () => {
  it("is stable and in range", () => {
    expect(tintIndex("Divano Club")).toBe(tintIndex("Divano Club"));
    for (const n of ["a", "Divano Club", "Sala Grande", "ñandú", ""]) expect(tintIndex(n)).toBeGreaterThanOrEqual(0), expect(tintIndex(n)).toBeLessThan(8);
  });
  it("spreads names over every tint", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => tintIndex(`circle ${i}`)));
    expect(seen.size).toBe(8);
  });
});
