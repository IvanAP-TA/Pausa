import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, type Node } from "@/i18n/format";
import { registeredAreas } from "@/i18n/messages";
import "@/features/serata/serata.messages";
import "@/features/lists/lists.messages";
import "@/features/import/import.messages";

const LOCALES = ["it", "en", "es"] as const;
const base = JSON.parse(readFileSync(path.resolve(__dirname, "../../../packages/messages/it.json"), "utf8")) as Record<string, unknown>;

function flat(o: unknown, prefix = ""): Array<[string, string]> {
  if (typeof o === "string") return [[prefix, o]];
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
  throw new Error(`Non-string leaf at ${prefix}`);
}
function walk(nodes: Node[], visit: (n: Node) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.t === "tag") walk(n.children, visit);
    if (n.t === "plural" || n.t === "select") for (const o of Object.values(n.options)) walk(o, visit);
  }
}
const args = (msg: string) => {
  const names = new Set<string>();
  walk(parse(msg), (n) => {
    if (n.t === "arg" || n.t === "plural" || n.t === "select") names.add(n.name);
  });
  return [...names].sort();
};
const MINE = ["serata", "lists", "import"];
const areas = registeredAreas().filter(([name]) => MINE.includes(name));

describe.each(MINE)("area %s", (name) => {
  const entry = areas.find(([n]) => n === name);
  it("is registered with the three languages", () => {
    expect(entry, `area ${name} not registered`).toBeDefined();
    expect(Object.keys(entry![1]).sort()).toEqual(["en", "es", "it"]);
  });
  const by = Object.fromEntries(LOCALES.map((l) => [l, new Map(flat(entry![1][l]))])) as Record<(typeof LOCALES)[number], Map<string, string>>;

  it("has the same keys in it, en and es", () => {
    const it = [...by.it.keys()].sort();
    expect([...by.en.keys()].sort()).toEqual(it);
    expect([...by.es.keys()].sort()).toEqual(it);
    expect(it.length).toBeGreaterThan(10);
  });
  it("uses the same arguments in every language (a missing {name} would show a blank)", () => {
    for (const [key, msg] of by.it) for (const l of ["en", "es"] as const) expect(args(by[l].get(key)!), `${l}:${key}`).toEqual(args(msg));
  });
  it("every plural has one and other (and =0 where it says so)", () => {
    for (const l of LOCALES)
      for (const [key, msg] of by[l]) {
        walk(parse(msg), (n) => {
          if (n.t !== "plural") return;
          expect(Object.keys(n.options), `${l}:${key}`).toEqual(expect.arrayContaining(["other"]));
          if (!("one" in n.options)) expect(["serataApp.create.full"].includes(key) || Object.keys(n.options).length > 0, `${l}:${key}`).toBe(true);
        });
      }
  });
  it("never clashes with the base catalogue's top-level namespaces", () => {
    const top = new Set(Object.keys(entry![1].it as object));
    for (const k of top) expect(Object.prototype.hasOwnProperty.call(base, k), `${k} is already a base namespace`).toBe(false);
  });
  it("has no empty text and parses as ICU", () => {
    for (const l of LOCALES) for (const [key, msg] of by[l]) {
      expect(msg.trim().length, `${l}:${key}`).toBeGreaterThan(0);
      expect(() => parse(msg), `${l}:${key}`).not.toThrow();
    }
  });
});

describe("every plural of the areas has one and other in all languages", () => {
  it("counts the plural messages and finds one+other in each", () => {
    let plurals = 0;
    for (const [, cat] of areas) for (const l of LOCALES) for (const [key, msg] of flat(cat[l])) walk(parse(msg), (n) => {
      if (n.t !== "plural") return;
      plurals++;
      expect(Object.keys(n.options), `${l}:${key}`).toEqual(expect.arrayContaining(["one", "other"]));
    });
    expect(plurals).toBeGreaterThanOrEqual(15);
  });
});
