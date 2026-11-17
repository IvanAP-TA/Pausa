import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getCardData } from "@/lib/serata/server";
import { posterUrl } from "@/lib/tmdb-image";
import { CARD } from "@/lib/card-theme";
import { loadCardFonts } from "@/lib/og-font";
import { pauseBars } from "@/lib/pause-mark";
import { qrDataUri } from "@/lib/qr";
import { siteUrl } from "@/lib/site";
import it from "../../../../../../messages/it.json";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const MESSAGES = { it, en, es };

/**
 * The Serata Card as a PNG, public by design ("private inside, viral outside"): it shows the title,
 * the Cerchia name, date and counts, never who voted what.
 * ?format=story (1080×1920, default) for Instagram/WhatsApp stories, ?format=og (1200×630) for link previews.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/serata/[code]/card">) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const lp = url.searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  const og = url.searchParams.get("format") === "og";

  const card = await getCardData(code, locale);
  if (!card) return new Response("Not found", { status: 404 });

  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "serata" });
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(card.finishedAt);
  const kicker = t("result.kicker");
  const subtitle = t("result.subtitle");
  // The display face draws capitals only: uppercase in code, so the font subset holds the glyphs actually drawn.
  const title = card.winner.title.toLocaleUpperCase(locale);
  const line1 = [card.circleName, date].filter(Boolean).join(", ");
  const line2 = [t(`mode.${card.mode}`), card.mode === "bracket" ? t("result.rounds", { count: card.rounds }) : null, t("result.people", { count: card.voters })]
    .filter(Boolean).join(", ");

  // The condensed capitals for the title only, Barlow for the rest (each subset to the glyphs it draws).
  const font = await loadCardFonts({ display: title, body: [kicker, subtitle, line1, line2, "pausa.gnagno.org"].join(" ") });

  const [w, h] = og ? [1200, 630] : [1080, 1920];
  const poster = card.winner.posterPath ? posterUrl(card.winner.posterPath, "w500") : null;
  const titleSize = og
    ? (title.length > 30 ? 84 : title.length > 12 ? 112 : 150)
    : title.length > 34 ? 104 : title.length > 13 ? 140 : 200;
  const posterW = og ? 420 : w;
  const posterH = og ? h : Math.round(h * 0.58);

  const caption = (
    <div style={{
      display: "flex", flexDirection: "column", width: og ? w - posterW : w, flex: 1,
      padding: og ? "48px 56px" : "44px 72px 56px", background: CARD.paper, color: CARD.ink,
    }}>
      <div style={{ display: "flex", fontSize: og ? 22 : 32, lineHeight: 1.2, color: CARD.ink2 }}>{kicker}</div>
      <div style={{ display: "flex", marginTop: og ? 6 : 8, fontSize: titleSize, lineHeight: 0.88, fontWeight: 200, fontFamily: font.display, wordBreak: "break-word" }}>{title}</div>
      <div style={{ display: "flex", marginTop: og ? 10 : 12, fontSize: og ? 26 : 38, lineHeight: 1.2 }}>{subtitle}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", paddingTop: og ? 20 : 28, borderTop: `1px solid ${CARD.rule}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: og ? 10 : 16 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: og ? 22 : 30, lineHeight: 1.3, color: CARD.ink2 }}>
            {line1 && <span>{line1}</span>}
            <span>{line2}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: og ? 12 : 18, fontSize: og ? 20 : 28, color: CARD.muted }}>
            {pauseBars(og ? 8 : 12, og ? 24 : 36, og ? 5 : 7)}
            <span>pausa.gnagno.org</span>
          </div>
        </div>
        {!og && (
          // A scan opens Pausa's landing: the Card is the one thing meant to leave the app, so it carries the way in.
          // Dark modules on the light plate: a QR printed the other way round does not scan everywhere.
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
          <img src={qrDataUri(`${siteUrl()}/${locale}?utm_source=card`, { dark: CARD.paper, light: CARD.ink })} width={140} height={140} alt="" />
        )}
      </div>
    </div>
  );

  const posterBox = (
    <div style={{ display: "flex", width: posterW, height: posterH, background: CARD.paper3 }}>
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
        <img src={poster} alt="" width={posterW} height={posterH} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: og ? "row" : "column", background: CARD.paper, fontFamily: font.body }}>
        {posterBox}
        {caption}
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: font.fonts,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
