import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getCardData } from "@/lib/serata/server";
import { posterUrl } from "@/lib/tmdb-image";
import { loadGoogleFont } from "@/lib/og-font";
import it from "../../../../../../messages/it.json";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const MESSAGES = { it, en, es };

/* Same fixed palette as the in-app Card (card-* tokens in globals.css): it looks the same in light and dark. */
const C = { paper: "#FBF8F2", ink: "#151413", muted: "#5E5A52", accent: "#C9361F", rule: "#D6CFC1", empty: "#2F5D62" };

/**
 * The Serata Card as a PNG, public by design ("private inside, viral outside"): it shows the title,
 * the Cerchia name, date and counts — never who voted what.
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
  const subtitle = `— ${t("result.subtitle")}`;
  const title = card.winner.title;
  const line1 = [card.circleName, date].filter(Boolean).join(" · ");
  const line2 = [t(`mode.${card.mode}`), card.mode === "bracket" ? t("result.rounds", { count: card.rounds }) : null, t("result.people", { count: card.voters })]
    .filter(Boolean).join(" · ");

  // Gloock for the title only, Instrument Sans for the rest (each subset to the glyphs it draws).
  const [display, body] = await Promise.all([
    loadGoogleFont("Gloock", 400, title),
    loadGoogleFont("Instrument Sans", 500, [kicker, subtitle, line1, line2, "pausa.gnagno.org"].join(" ")),
  ]);

  const [w, h] = og ? [1200, 630] : [1080, 1920];
  const poster = card.winner.posterPath ? posterUrl(card.winner.posterPath, "w500") : null;
  const titleSize = og ? (title.length > 24 ? 60 : 76) : title.length > 22 ? 104 : 128;

  const caption = (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: og ? "flex-start" : "center", textAlign: og ? "left" : "center",
      justifyContent: og ? "center" : "flex-start", gap: og ? 14 : 22, padding: og ? "0 64px" : "56px 80px 64px",
      background: C.paper, color: C.ink, flex: 1,
      borderTop: og ? "none" : `10px solid ${C.accent}`, borderLeft: og ? `8px solid ${C.accent}` : "none",
    }}>
      <div style={{ fontSize: og ? 22 : 34, color: C.accent, letterSpacing: 4 }}>{kicker}</div>
      <div style={{ fontSize: titleSize, lineHeight: 1.02, fontFamily: display ? "Gloock" : undefined, maxWidth: og ? 640 : w - 160 }}>{title}</div>
      <div style={{ fontSize: og ? 24 : 38, color: C.accent }}>{subtitle}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: og ? "flex-start" : "center", fontSize: og ? 20 : 30, color: C.muted, gap: 4 }}>
        {line1 && <span>{line1}</span>}
        <span>{line2}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: og ? 10 : "auto", fontSize: og ? 18 : 28, color: C.muted }}>
        <span>pausa.gnagno.org</span>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
          <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
        </div>
      </div>
    </div>
  );

  const posterBox = (
    <div style={{ display: "flex", width: og ? 420 : w, height: og ? h : Math.round(h * 0.58), background: C.empty }}>
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
        <img src={poster} alt="" width={og ? 420 : w} height={og ? h : Math.round(h * 0.58)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: og ? "row" : "column", background: C.paper, fontFamily: body ? "Instrument Sans" : undefined }}>
        {posterBox}
        {caption}
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: [
        ...(body ? [{ name: "Instrument Sans", data: body, weight: 500 as const, style: "normal" as const }] : []),
        ...(display ? [{ name: "Gloock", data: display, weight: 400 as const, style: "normal" as const }] : []),
      ],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
