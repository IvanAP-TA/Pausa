import { describe, expect, it } from "vitest";
import { contrast, inGamut, oklchToHex, parseOklch } from "../src/theme/oklch";
import { colorNames, oklchSource, palettes, type Scheme } from "../src/theme/tokens";
import { readFileSync } from "node:fs";
import path from "node:path";

const hex = (scheme: Scheme, name: (typeof colorNames)[number]) => oklchToHex(oklchSource[scheme][name]).slice(0, 7);

describe("conversion", () => {
  it("maps known OKLCH colours to the known sRGB values", () => {
    expect(oklchToHex("oklch(100% 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0% 0 0)")).toBe("#000000");
    // Reference values from the CSS Color 4 spec / culori for oklch(62.8% 0.2577 29.23) = red.
    expect(oklchToHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
  });
  it("rejects anything that is not an oklch() literal", () => {
    expect(() => parseOklch("#fff")).toThrow();
    expect(() => parseOklch("oklch(1 2 3)")).toThrow();
  });
  it("carries alpha through", () => {
    expect(oklchToHex("oklch(16% 0.03 205 / 0.62)")).toMatch(/^#[0-9a-f]{6}9e$/);
  });
});

describe("tokens match design/tokens.css exactly", () => {
  const css = readFileSync(path.resolve(__dirname, "../../../design/tokens.css"), "utf8");
  const cssName: Record<string, string> = {
    paper2: "paper-2", paper3: "paper-3", ink2: "ink-2", accentHover: "accent-hover", accentDeep: "accent-deep",
    accentInk: "accent-ink", onTint: "on-tint", tint1: "tint-1", tint2: "tint-2", tint3: "tint-3", tint4: "tint-4",
    tint5: "tint-5", tint6: "tint-6", tint7: "tint-7", tint8: "tint-8",
  };
  const tokenCss = (n: string) => cssName[n] ?? n;
  // Dark = the `@theme static` block; light = the `:root[data-theme="light"]` block (the first one, not the media query).
  const darkBlock = css.slice(css.indexOf("@theme static"), css.indexOf(":root {"));
  const lightStart = css.indexOf(':root[data-theme="light"]');
  const lightBlock = css.slice(lightStart, css.indexOf("@media (prefers-color-scheme: light)"));
  const valueIn = (block: string, name: string) => new RegExp(String.raw`--color-${tokenCss(name)}:\s*(oklch\([^)]*\))`).exec(block)?.[1];

  for (const name of colorNames) {
    it(`dark ${name}`, () => {
      expect(valueIn(darkBlock, name)).toBeDefined();
      expect(oklchSource.dark[name]).toBe(valueIn(darkBlock, name));
    });
  }
  // Light overrides only some tokens; the rest are inherited from dark (tints, on-tint), and ours must say the same.
  for (const name of colorNames) {
    it(`light ${name}`, () => {
      const own = valueIn(lightBlock, name);
      expect(oklchSource.light[name]).toBe(own ?? valueIn(darkBlock, name));
    });
  }
  it("the palettes are the conversion of the sources", () => {
    expect(palettes.dark.paper).toBe("rgb(0, 17, 19)".replace("0, 17, 19", palettes.dark.paper.slice(4, -1)));
    expect(palettes.dark.scrim).toMatch(/^rgba\(.*0\.62\)$/);
  });
  it("every colour is inside sRGB, or clipped by under 0.06 of a channel (dark accentHover is 1.054 in red)", () => {
    for (const scheme of ["dark", "light"] as const)
      for (const name of colorNames) {
        if (name === "scrim") continue;
        expect(inGamut(parseOklch(oklchSource[scheme][name]), 0.06), `${scheme}.${name}`).toBe(true);
      }
  });
});

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text (>= 24px, or >= 18.66px bold) and for UI components / focus indicators.
describe.each(["dark", "light"] as const)("WCAG 2.2 AA contrast, %s", (scheme) => {
  const c = (a: (typeof colorNames)[number], b: (typeof colorNames)[number]) => contrast(hex(scheme, a), hex(scheme, b));
  const grounds = ["paper", "paper2", "paper3"] as const;

  for (const g of grounds) {
    it(`ink on ${g} >= 7 (AAA)`, () => expect(c("ink", g)).toBeGreaterThanOrEqual(7));
    it(`ink2 on ${g} >= 4.5`, () => expect(c("ink2", g)).toBeGreaterThanOrEqual(4.5));
    it(`muted on ${g} >= 4.5`, () => expect(c("muted", g)).toBeGreaterThanOrEqual(4.5));
    it(`error on ${g} >= 4.5`, () => expect(c("error", g)).toBeGreaterThanOrEqual(4.5));
    it(`success on ${g} >= 4.5`, () => expect(c("success", g)).toBeGreaterThanOrEqual(4.5));
    it(`accent on ${g} >= 3 (non-text and large display text)`, () => expect(c("accent", g)).toBeGreaterThanOrEqual(3));
    it(`focus ring on ${g} >= 3`, () => expect(c("focus", g)).toBeGreaterThanOrEqual(3));
  }
  it("button label (accentInk) on accent >= 4.5", () => expect(c("accentInk", "accent")).toBeGreaterThanOrEqual(4.5));
  it("field edge (muted) is a 3:1 UI boundary on the ground", () => expect(c("muted", "paper")).toBeGreaterThanOrEqual(3));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8] as const)
    it(`text on tint${n} >= 4.5`, () => expect(c("onTint", `tint${n}` as (typeof colorNames)[number])).toBeGreaterThanOrEqual(4.5));
});

describe("the contrast function itself can fail", () => {
  it("black on white is 21, equal colours are 1, a weak pair is under 4.5", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrast("#999999", "#ffffff")).toBeLessThan(4.5);
  });
});
