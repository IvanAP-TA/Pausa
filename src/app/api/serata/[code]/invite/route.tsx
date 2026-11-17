import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getInviteData } from "@/lib/serata/server";
import { posterUrl } from "@/lib/tmdb-image";
import { CARD } from "@/lib/card-theme";
import { loadCardFonts } from "@/lib/og-font";
import { pauseBars } from "@/lib/pause-mark";
import it from "../../../../../../messages/it.json";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const MESSAGES = { it, en, es };

/** The link preview of an open Serata (what WhatsApp shows when the host shares the link): host, mode and a strip of posters. */
export async function GET(request: Request, ctx: RouteContext<"/api/serata/[code]/invite">) {
  const { code } = await ctx.params;
  const lp = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  const data = await getInviteData(code, locale);
  if (!data) return new Response("Not found", { status: 404 });

  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "serata" });
  // The display face draws capitals only: uppercase in code, so the font subset holds the glyphs actually drawn.
  const headline = t("invite.headline", { host: data.host || "Pausa" }).toLocaleUpperCase(locale);
  const sub = t("invite.sub", { mode: t(`mode.${data.mode}`), count: data.count });
  const cta = t("invite.cta");
  const font = await loadCardFonts({ display: headline, displayRegular: "PAUSA", body: `${sub} ${cta} pausa.gnagno.org` });

  const n = data.posters.length;
  const tile = n <= 1 ? { w: 420, h: 630 } : n === 2 ? { w: 210, h: 630 } : { w: 210, h: 315 };

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: CARD.paper, color: CARD.ink, fontFamily: font.body }}>
        <div style={{ display: "flex", flexDirection: "column", width: 780, padding: "48px 56px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {pauseBars(9, 28, 6)}
            <div style={{ display: "flex", fontSize: 40, lineHeight: 1, fontWeight: 400, fontFamily: font.display }}>PAUSA</div>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: headline.length > 34 ? 76 : 96, lineHeight: 0.88, fontWeight: 200, fontFamily: font.display, wordBreak: "break-word" }}>{headline}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 26, lineHeight: 1.3, color: CARD.ink2 }}>{sub}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 20, borderTop: `1px solid ${CARD.rule}` }}>
            <div style={{ display: "flex", fontSize: 26, lineHeight: 1.3 }}>{cta}</div>
            <div style={{ display: "flex", fontSize: 20, color: CARD.muted }}>pausa.gnagno.org</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 420, height: 630, background: CARD.paper3 }}>
          {data.posters.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
            <img key={p} src={posterUrl(p, "w342")} alt="" width={tile.w} height={tile.h} style={{ width: tile.w, height: tile.h, objectFit: "cover" }} />
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font.fonts,
      headers: { "Cache-Control": "public, max-age=300" },
    },
  );
}
