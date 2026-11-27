// The it/en/es fallbacks of src/i18n/intl.native.ts (used on Hermes, which lacks these Intl classes) against Node's real Intl, value by
// value: on the phone the words must be the ones the web app shows.
import { describe, expect, it } from "vitest";
import { fallbackList, fallbackPlural, fallbackRelativeTime, listFormat, pluralRules, relativeTimeFormat, type TimeUnit } from "../src/i18n/intl.native";

const LOCALES = ["it", "en", "es"];
const NUMBERS = [0, 1, 2, 3, 4, 5, 8, 11, 12, 13, 21, 22, 23, 80, 101, 111, 800, 1000, 1_000_000, 2_000_000, 1.5, 0.5];

describe("plural rules without Intl.PluralRules", () => {
  for (const l of LOCALES)
    for (const ordinal of [false, true])
      it(`${l} ${ordinal ? "ordinal" : "cardinal"} matches Intl`, () => {
        const real = new Intl.PluralRules(l, { type: ordinal ? "ordinal" : "cardinal" });
        const mine = fallbackPlural(l, ordinal);
        for (const n of NUMBERS) expect(mine.select(n), `${l} ${n}`).toBe(real.select(n));
      });
});

describe("relative time without Intl.RelativeTimeFormat", () => {
  const units: TimeUnit[] = ["second", "minute", "hour", "day", "week", "month", "year"];
  for (const l of LOCALES)
    it(`${l} matches Intl (numeric: auto)`, () => {
      const real = new Intl.RelativeTimeFormat(l, { numeric: "auto" });
      const mine = fallbackRelativeTime(l);
      for (const u of units)
        for (const v of [-11, -3, -2, -1, 0, 1, 2, 5])
          if (!(u === "second" && v !== 0)) expect(mine.format(v, u), `${l} ${v} ${u}`).toBe(real.format(v, u));
    });
});

describe("lists without Intl.ListFormat", () => {
  for (const l of LOCALES)
    it(`${l} matches Intl`, () => {
      const real = new Intl.ListFormat(l, { type: "conjunction" });
      for (const items of [[], ["Marco"], ["Marco", "Sofi"], ["Marco", "Sofi", "Giulia"], ["a", "b", "c", "d"]]) expect(fallbackList(l, items)).toBe(real.format(items));
    });
});

describe("the helpers pick the engine's class when there is one, the fallback when there is none", () => {
  it("with Intl complete (browser, Node) they are the real thing", () => {
    expect(pluralRules("en", true).select(2)).toBe("two");
    expect(relativeTimeFormat("it").format(-1, "day")).toBe("ieri");
    expect(listFormat("es", ["a", "b"])).toBe("a y b");
  });

  it("with Hermes' Intl (no PluralRules, RelativeTimeFormat, ListFormat) the helpers still answer", () => {
    const saved = { P: Intl.PluralRules, R: Intl.RelativeTimeFormat, L: Intl.ListFormat };
    const I = Intl as unknown as Record<string, unknown>;
    I.PluralRules = undefined;
    I.RelativeTimeFormat = undefined;
    I.ListFormat = undefined;
    try {
      // what format.ts asks on the phone (Metro gives it intl.native.ts there)
      expect(pluralRules("it", false).select(1)).toBe("one");
      expect(pluralRules("it", false).select(3)).toBe("other");
      expect(pluralRules("en", true).select(22)).toBe("two");
      expect(relativeTimeFormat("en").format(-2, "hour")).toBe("2 hours ago");
      expect(listFormat("it", ["Marco", "Sofi", "Giulia"])).toBe("Marco, Sofi e Giulia");
    } finally {
      I.PluralRules = saved.P;
      I.RelativeTimeFormat = saved.R;
      I.ListFormat = saved.L;
    }
  });
});
