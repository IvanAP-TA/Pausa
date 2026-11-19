import { describe, expect, it } from "vitest";
import { nativeDoneUrl, nativeStartUrl, safeNext } from "./native-shell";

describe("safeNext (where the shell lands after signing in)", () => {
  it("keeps a path inside the app, query and all", () => {
    expect(safeNext("/it/c/c-divano")).toBe("/it/c/c-divano");
    expect(safeNext("/it/s/ABC123?x=1")).toBe("/it/s/ABC123?x=1");
  });
  it("refuses anything that could leave the site", () => {
    for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "evil", "", null, undefined]) {
      expect(safeNext(bad as string | null)).toBe("/it");
    }
  });
  it("uses the fallback it is given", () => {
    expect(safeNext("//x", "/en")).toBe("/en");
  });
});

describe("native sign-in addresses", () => {
  it("encodes the destination so it survives as one parameter", () => {
    expect(nativeDoneUrl("/it/c/a?b=1&c=2")).toBe("/api/native/done?next=%2Fit%2Fc%2Fa%3Fb%3D1%26c%3D2");
    expect(nativeStartUrl("/it")).toBe("/api/native/start?next=%2Fit");
  });
});
