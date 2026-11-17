import { describe, expect, it } from "vitest";
import { qrDataUri, qrMatrix, qrSvg } from "./qr";

describe("qr", () => {
  it("is a square matrix with the three finder patterns in the corners", () => {
    const m = qrMatrix("https://pausa.gnagno.org/it");
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const n = m.length;
    // A finder pattern is a 7x7 ring with a 3x3 core: its corner and centre are dark, the ring just inside is light.
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c]).toBe(true);
      expect(m[r + 3][c + 3]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
    }
  });

  it("is deterministic and depends on the text", () => {
    expect(qrMatrix("a")).toEqual(qrMatrix("a"));
    expect(qrMatrix("a")).not.toEqual(qrMatrix("b"));
  });

  it("makes a valid standalone SVG and a data URI", () => {
    const svg = qrSvg("https://pausa.gnagno.org/it", { dark: "#000", light: "#fff" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0');
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(qrDataUri("x").startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });
});
