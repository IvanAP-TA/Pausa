import "server-only";
import { CARD_FONT } from "@/lib/card-theme";

/**
 * Loads a Google font as TTF for next/og (Satori can't read woff2), subset to `text`.
 * Returns null on failure so images still render with the default font.
 */
export async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1]);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

type CardFont = { name: string; data: ArrayBuffer; weight: 200 | 400; style: "normal" };

/**
 * The two Darkroom faces for a card, each subset to the glyphs it draws: `display` is the text set in hairline
 * capitals (pass it already uppercased), `displayRegular` the text set in the regular weight of the same face,
 * `body` everything in Barlow. A face that fails to load comes back as an undefined family, so the image
 * falls back to the default font.
 */
export async function loadCardFonts(text: { display?: string; displayRegular?: string; body?: string }) {
  const [hairline, regular, body] = await Promise.all([
    text.display ? loadGoogleFont(CARD_FONT.display, 200, text.display) : null,
    text.displayRegular ? loadGoogleFont(CARD_FONT.display, 400, text.displayRegular) : null,
    text.body ? loadGoogleFont(CARD_FONT.body, 400, text.body) : null,
  ]);
  const fonts: CardFont[] = [
    ...(body ? [{ name: CARD_FONT.body, data: body, weight: 400 as const, style: "normal" as const }] : []),
    ...(hairline ? [{ name: CARD_FONT.display, data: hairline, weight: 200 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: CARD_FONT.display, data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];
  return {
    fonts,
    display: hairline || regular ? CARD_FONT.display : undefined,
    body: body ? CARD_FONT.body : undefined,
  };
}
