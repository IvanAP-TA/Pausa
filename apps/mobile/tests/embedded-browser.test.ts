import { describe, expect, it } from "vitest";
import { isEmbeddedBrowser } from "../src/features/embedded-browser";

describe("isEmbeddedBrowser", () => {
  it("recognises in-app browsers", () => {
    expect(isEmbeddedBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/430.0]")).toBe(true);
    expect(isEmbeddedBrowser("Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(true);
    expect(isEmbeddedBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe(true);
    expect(isEmbeddedBrowser("Mozilla/5.0 Instagram 300.0")).toBe(true);
  });
  it("leaves real browsers alone", () => {
    expect(isEmbeddedBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isEmbeddedBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe(false);
    expect(isEmbeddedBrowser("")).toBe(false);
  });
});
