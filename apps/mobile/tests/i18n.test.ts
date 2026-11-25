import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import { formatMessage, IcuSyntaxError, parse, render, type Node } from "../src/i18n/format";
import { lookup } from "../src/i18n/messages";

const root = path.resolve(__dirname, "../../..");
const LOCALES = ["it", "en", "es"] as const;
const load = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const catalogue = Object.fromEntries(LOCALES.map((l) => [l, load(path.join(root, "packages/messages", `${l}.json`))]));
const original = Object.fromEntries(LOCALES.map((l) => [l, load(path.join(root, "messages", `${l}.json`))]));

/** Flattens to dotted paths; arrays use their index (`landing.faq.items.0.q`). Only string leaves. */
function flat(o: unknown, prefix = ""): Array<[string, string]> {
  if (typeof o === "string") return [[prefix, o]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flat(v, prefix ? `${prefix}.${i}` : String(i)));
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
  throw new Error(`Non-string leaf at ${prefix}: ${JSON.stringify(o)}`);
}
const flats = Object.fromEntries(LOCALES.map((l) => [l, new Map(flat(catalogue[l]))]));

function walk(nodes: Node[], visit: (n: Node) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.t === "tag") walk(n.children, visit);
    if (n.t === "plural" || n.t === "select") for (const o of Object.values(n.options)) walk(o, visit);
  }
}
const shape = (msg: string) => {
  const args = new Set<string>();
  const tags = new Set<string>();
  walk(parse(msg), (n) => {
    if (n.t === "arg" || n.t === "plural" || n.t === "select") args.add(n.name);
    if (n.t === "tag") tags.add(n.name);
  });
  return { args: [...args].sort(), tags: [...tags].sort() };
};

// Original string that is deliberately `other`-only (always plural: a Serata has at least 2 titles). Nothing else may be.
const OTHER_ONLY = new Set(["serata.createWith"]);

describe("packages/messages", () => {
  it("has the three locales with the same keys, in both directions", () => {
    const base = new Set(flats.it.keys());
    for (const l of ["en", "es"] as const) {
      const other = new Set(flats[l].keys());
      expect([...base].filter((k) => !other.has(k)), `keys in it missing from ${l}`).toEqual([]);
      expect([...other].filter((k) => !base.has(k)), `keys in ${l} missing from it`).toEqual([]);
    }
  });

  it("keeps every original key and value untouched (the copy is additive only)", () => {
    for (const l of LOCALES) {
      const orig = flat(original[l]);
      expect(orig.length).toBeGreaterThanOrEqual(932);
      for (const [k, v] of orig) expect(flats[l].get(k), `${l}:${k}`).toBe(v);
    }
  });

  it("has no empty strings", () => {
    for (const l of LOCALES) for (const [k, v] of flats[l]) expect(v.trim().length, `${l}:${k}`).toBeGreaterThan(0);
  });

  it("every message parses as ICU", () => {
    for (const l of LOCALES) for (const [k, v] of flats[l]) expect(() => parse(v), `${l}:${k}`).not.toThrow();
  });

  it("every plural has `one` and `other`, in every locale", () => {
    let plurals = 0;
    for (const l of LOCALES)
      for (const [k, v] of flats[l]) {
        walk(parse(v), (n) => {
          if (n.t !== "plural") return;
          plurals++;
          if (OTHER_ONLY.has(k)) return;
          expect(Object.keys(n.options), `${l}:${k}`).toEqual(expect.arrayContaining(["one", "other"]));
        });
      }
    // 59 messages in the original catalogue use plural (some hold two plurals); ours adds more, never fewer.
    const messagesWithPlural = [...flats.it].filter(([, v]) => /\bplural\b/.test(v)).length;
    expect(messagesWithPlural).toBeGreaterThanOrEqual(59);
    expect(plurals).toBeGreaterThanOrEqual(59 * 3);
  });

  it("the same message uses the same arguments and tags in every locale", () => {
    for (const [k, v] of flats.it) {
      const s = shape(v);
      for (const l of ["en", "es"] as const) expect(shape(flats[l].get(k)!), `${l}:${k}`).toEqual(s);
    }
  });

  it("the 7 rich strings (tags) are all still rich", () => {
    const withTags = [...flats.it].filter(([, v]) => shape(v).tags.length > 0).map(([k]) => k);
    expect(withTags.length).toBe(7);
  });
});

describe("formatter", () => {
  it("formats plurals with =0, one and other, and `#`", () => {
    const m = "{used, plural, =0 {Mai usato} one {Usato # volta} other {Usato # volte}}";
    expect(formatMessage(m, "it", { used: 0 })).toBe("Mai usato");
    expect(formatMessage(m, "it", { used: 1 })).toBe("Usato 1 volta");
    expect(formatMessage(m, "it", { used: 5 })).toBe("Usato 5 volte");
    expect(formatMessage(m, "it", { used: 12000 })).toBe("Usato 12.000 volte");
  });
  it("handles select and tags", () => {
    expect(formatMessage("{g, select, f {lei} other {loro}}", "it", { g: "f" })).toBe("lei");
    expect(formatMessage("{g, select, f {lei} other {loro}}", "it", { g: "x" })).toBe("loro");
    expect(render<string>(parse("<b>{name}</b> ha visto"), "it", { name: "Ada" }, { b: (c) => `[${c.join("")}]` }).join("")).toBe("[Ada] ha visto");
    expect(formatMessage("<b>{name}</b> x", "it", { name: "Ada" })).toBe("Ada x");
  });
  it("throws on a missing value and on bad syntax (so a mistake cannot ship silently)", () => {
    expect(() => formatMessage("Ciao {name}", "it", {})).toThrow(/Missing value/);
    expect(() => parse("{n, plural, one {x}}")).toThrow(IcuSyntaxError);
    expect(() => parse("{oops")).toThrow(IcuSyntaxError);
    expect(() => parse("<b>no close")).toThrow(IcuSyntaxError);
  });
  it("treats a lone apostrophe as text and a doubled one as an apostrophe", () => {
    expect(formatMessage("L'email e l''altra", "it")).toBe("L'email e l'altra");
  });

  it("gives the same output as intl-messageformat on every message of every locale", () => {
    let compared = 0;
    for (const l of LOCALES)
      for (const [k, v] of flats[l]) {
        const ast = parse(v);
        const plural = new Set<string>();
        walk(ast, (n) => {
          if (n.t === "plural") plural.add(n.name);
        });
        const values: Record<string, string | number> = {};
        walk(ast, (n) => {
          if (n.t === "arg" || n.t === "plural" || n.t === "select") values[n.name] = plural.has(n.name) ? 0 : "Ada";
        });
        const tags = { b: (c: string[]) => `[b:${c.join("")}]`, link: (c: string[]) => `[link:${c.join("")}]` };
        for (const n of plural.size ? [0, 1, 2, 5, 21, 1000] : [0]) {
          for (const p of plural) values[p] = n;
          const mine = render<string>(ast, l, values, tags).join("");
          const theirs = new IntlMessageFormat(v, l).format((shape(v).tags.length ? { ...values, ...tags } : values) as never) as string[] | string;
          expect(mine, `${l}:${k} n=${n}`).toBe(Array.isArray(theirs) ? theirs.join("") : theirs);
          compared++;
        }
      }
    expect(compared).toBeGreaterThan(2796);
  });
  it("lookup reads arrays by index", () => {
    expect(lookup(catalogue.it, "landing.faq.items.0.q")).toBe("Quanto costa?");
  });
});
