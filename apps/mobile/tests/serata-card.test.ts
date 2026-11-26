import { describe, expect, it } from "vitest";
import { cardLayout, coverCrop, qrRuns, SIZES, titleSize, wrapLines } from "@/features/serata/card-spec";
import { qrMatrix } from "@/features/serata/qr";

describe("the card layout", () => {
  it("has the two sizes the shares need, and everything sits inside the image", () => {
    expect(SIZES).toEqual({ story: { w: 1080, h: 1920 }, og: { w: 1200, h: 630 } });
    for (const v of ["story", "og"] as const) {
      const L = cardLayout(v);
      expect([L.w, L.h]).toEqual([SIZES[v].w, SIZES[v].h]);
      for (const r of [L.poster, L.qr]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(L.w);
        expect(r.y + r.h).toBeLessThanOrEqual(L.h);
      }
      if (v === "og") expect(L.poster.h / L.poster.w).toBeCloseTo(1.5); // 2:3, like a poster (the story runs the print edge to edge and crops it)
      else expect(L.poster.w).toBe(L.w);
      expect(L.title.x + L.title.width).toBeLessThanOrEqual(L.w);
    }
  });
  it("the text blocks never run into the QR code", () => {
    const L = cardLayout("og");
    const metaRight = L.meta.x + L.meta.width;
    expect(metaRight).toBeLessThanOrEqual(L.qr.x); // v1 of this card overlapped them: the date was hidden under the code
    const S = cardLayout("story");
    expect(S.meta.y + S.meta.size * 1.3 * 2).toBeLessThanOrEqual(S.qr.y + 8);
    expect(S.qrCaption!.x).toBeGreaterThanOrEqual(S.qr.x + S.qr.w);
  });
  it("shorter titles are set bigger", () => {
    expect(titleSize("story", "Heat")).toBeGreaterThan(titleSize("story", "Le fabuleux destin d'Amélie Poulain"));
    expect(titleSize("og", "Heat")).toBeGreaterThan(titleSize("og", "Le fabuleux destin d'Amélie Poulain, version longue"));
  });
});

describe("wrapLines", () => {
  const width = (s: string, size: number) => s.length * size; // 1 em per character: easy to count
  it("wraps on words and keeps each line inside the width", () => {
    expect(wrapLines("uno due tre quattro", 120, 10, 5, width)).toEqual(["uno due tre", "quattro"]);
    for (const l of wrapLines("uno due tre quattro cinque sei", 100, 10, 9, width)) expect(width(l, 10)).toBeLessThanOrEqual(100);
  });
  it("cuts the last line with an ellipsis when the title does not fit in the lines it has", () => {
    const lines = wrapLines("uno due tre quattro cinque sei sette otto nove", 100, 10, 2, width);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(width(lines[1], 10)).toBeLessThanOrEqual(100);
  });
  it("a single word longer than the line stays whole on its line; empty text is no lines", () => {
    expect(wrapLines("supercalifragilistico", 50, 10, 2, width)).toEqual(["supercalifragilistico"]);
    expect(wrapLines("   ", 50, 10, 2, width)).toEqual([]);
  });
});

describe("the QR code", () => {
  const url = "https://pausa.gnagno.org/it/s/ABC234";
  const m = qrMatrix(url);

  it("is a square with a real version size (21 + 4 per step) and the three finder squares", () => {
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect((m.length - 21) % 4).toBe(0);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const finder = (r: number, c: number) => {
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 7; j++) {
          const ring = i === 0 || i === 6 || j === 0 || j === 6;
          const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          expect(m[r + i][c + j], `finder at ${r},${c} cell ${i},${j}`).toBe(ring || core);
        }
    };
    finder(0, 0);
    finder(0, m.length - 7);
    finder(m.length - 7, 0);
  });
  it("is deterministic, and a different link gives a different code", () => {
    expect(qrMatrix(url)).toEqual(m);
    expect(qrMatrix(`${url}X`)).not.toEqual(m);
  });
  it("the runs drawn on the card rebuild exactly the dark modules (none lost, none added)", () => {
    const rebuilt = m.map((row) => row.map(() => false));
    for (const [r, c, len] of qrRuns(m)) for (let k = 0; k < len; k++) rebuilt[r][c + k] = true;
    expect(rebuilt).toEqual(m);
    expect(qrRuns(m).length).toBeLessThan(m.flat().filter(Boolean).length); // runs: fewer rectangles than modules
  });
});

describe("cover crop", () => {
  it("fills the poster box without stretching: a wide image loses its sides, a tall one its top and bottom", () => {
    const wide = coverCrop(3000, 1000, { w: 200, h: 300 });
    expect(wide.sh).toBe(1000);
    expect(wide.sw / wide.sh).toBeCloseTo(200 / 300);
    expect(wide.sx).toBeGreaterThan(0);
    const tall = coverCrop(1000, 3000, { w: 200, h: 300 });
    expect(tall.sw).toBe(1000);
    expect(tall.sh / tall.sw).toBeCloseTo(1.5);
    expect(tall.sy).toBeGreaterThan(0);
    const exact = coverCrop(400, 600, { w: 200, h: 300 });
    expect(exact).toEqual({ sx: 0, sy: 0, sw: 400, sh: 600 });
  });
});
