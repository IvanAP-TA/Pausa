// OKLCH -> sRGB conversion (Bjorn Ottosson's matrices) and WCAG 2.x contrast. Pure functions: used at runtime to turn the
// design tokens (written in OKLCH, exactly as in design/tokens.css) into hex, and by the unit tests to assert contrast.

export type Oklch = { l: number; c: number; h: number; alpha?: number };

/** Parses `oklch(73% 0.17 42)` or `oklch(16% 0.03 205 / 0.62)`. Throws on anything else: tokens must stay in this form. */
export function parseOklch(input: string): Oklch {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(input.trim());
  if (!m) throw new Error(`Not an oklch() colour: ${input}`);
  return { l: Number(m[1]) / 100, c: Number(m[2]), h: Number(m[3]), alpha: m[4] === undefined ? undefined : Number(m[4]) };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const decode = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

/** Linear-light sRGB (unclamped, so callers can tell if the colour is out of gamut). */
export function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

export function inGamut(color: Oklch, epsilon = 0.001): boolean {
  return oklchToLinear(color).every((v) => v >= -epsilon && v <= 1 + epsilon);
}

export function oklchToRgb(color: Oklch): [number, number, number] {
  const lin = oklchToLinear(color).map(clamp01);
  return lin.map((v) => Math.round(encode(v) * 255)) as [number, number, number];
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** `#rrggbb`, or `#rrggbbaa` when the colour carries an alpha. */
export function oklchToHex(input: string): string {
  const color = parseOklch(input);
  const [r, g, b] = oklchToRgb(color);
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return color.alpha === undefined ? base : base + hex2(Math.round(clamp01(color.alpha) * 255));
}

/** `rgba(r, g, b, a)` form, which every React Native version and every browser accepts. */
export function oklchToCss(input: string): string {
  const color = parseOklch(input);
  const [r, g, b] = oklchToRgb(color);
  return color.alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${color.alpha})`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance of an sRGB colour. */
export function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => decode(v / 255));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
