import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CARD } from "@/lib/card-theme";
import { loadCardFonts } from "@/lib/og-font";
import { pauseBars } from "@/lib/pause-mark";
import it from "../../../messages/it.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

export const alt = "Pausa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE = { it: it.landing.og.tagline, en: en.landing.og.tagline, es: es.landing.og.tagline };

/** The default social preview for every page under /[locale] (the Serata Card page brings its own). */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  // The display face draws capitals only: uppercase in code, so the font subset holds the glyphs actually drawn.
  const tagline = TAGLINE[locale].toLocaleUpperCase(locale);
  const font = await loadCardFonts({ display: tagline, displayRegular: "PAUSA", body: "pausa.gnagno.org" });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", background: CARD.paper, color: CARD.ink, fontFamily: font.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {pauseBars(12, 38, 8)}
          <div style={{ display: "flex", fontSize: 52, lineHeight: 1, fontWeight: 400, fontFamily: font.display }}>PAUSA</div>
        </div>
        <div style={{ display: "flex", fontSize: tagline.length > 40 ? 120 : 144, lineHeight: 0.88, fontWeight: 200, maxWidth: 1056, fontFamily: font.display, wordBreak: "break-word" }}>{tagline}</div>
        <div style={{ display: "flex", paddingTop: 18, fontSize: 28, color: CARD.muted, borderTop: `1px solid ${CARD.rule}` }}>pausa.gnagno.org</div>
      </div>
    ),
    {
      ...size,
      fonts: font.fonts,
    },
  );
}
