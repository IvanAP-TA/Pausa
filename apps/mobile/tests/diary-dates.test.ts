import { describe, expect, it } from "vitest";
import { dayKey, dayName, relativeTime } from "../src/features/diary/dates";

const NOW = new Date(2026, 10, 26, 12, 0, 0).getTime(); // Thu 26 Nov 2026, local noon
const ago = (s: number) => NOW - s * 1000;

describe("relativeTime (v1 format.relativeTime)", () => {
  it("picks the largest unit that fits", () => {
    expect(relativeTime(ago(20), NOW, "it")).toBe("ora");
    expect(relativeTime(ago(5 * 60), NOW, "it")).toBe("5 minuti fa");
    expect(relativeTime(ago(2 * 3600), NOW, "it")).toBe("2 ore fa");
    expect(relativeTime(ago(86_400), NOW, "it")).toBe("ieri");
    expect(relativeTime(ago(3 * 86_400), NOW, "it")).toBe("3 giorni fa");
    expect(relativeTime(ago(14 * 86_400), NOW, "it")).toBe("2 settimane fa");
    expect(relativeTime(ago(400 * 86_400), NOW, "en")).toBe("last year");
  });
});

describe("diary days", () => {
  it("today, yesterday, then the weekday", () => {
    expect(dayName(NOW - 3600_000, NOW, "it")).toBe("oggi");
    expect(dayName(NOW - 86_400_000, NOW, "it")).toBe("ieri");
    expect(dayName(NOW - 3 * 86_400_000, NOW, "it")).toBe("lunedì");
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });
});
