import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { guideFor, isGuideSlug } from "@/lib/guides";
import { CARD } from "@/lib/card-theme";
import { loadCardFonts } from "@/lib/og-font";
import { pauseBars } from "@/lib/pause-mark";

/** The social image of a public guide (1200x630): its title in hairline capitals on print-black, with Pausa's two bars. Public and cacheable. */
export async function GET(request: Request, ctx: RouteContext<"/api/og/guide/[slug]">) {
  const { slug } = await ctx.params;
  if (!isGuideSlug(slug)) return new Response("Not found", { status: 404 });
  const lp = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  // The display face draws capitals only: uppercase in code, so the font subset holds the glyphs actually drawn.
  const title = guideFor(locale, slug).title.toLocaleUpperCase(locale);

  const font = await loadCardFonts({ display: title, displayRegular: "PAUSA", body: "pausa.gnagno.org" });
  const size = title.length > 70 ? 92 : title.length > 48 ? 112 : 136;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: CARD.paper, color: CARD.ink, padding: "60px 72px", fontFamily: font.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {pauseBars(10, 32, 7)}
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1, fontWeight: 400, fontFamily: font.display }}>PAUSA</div>
        </div>
        <div style={{ display: "flex", fontSize: size, lineHeight: 0.88, fontWeight: 200, fontFamily: font.display, maxWidth: 1056, wordBreak: "break-word" }}>{title}</div>
        <div style={{ display: "flex", paddingTop: 18, fontSize: 26, color: CARD.muted, borderTop: `1px solid ${CARD.rule}` }}>pausa.gnagno.org</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font.fonts,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
    },
  );
}
