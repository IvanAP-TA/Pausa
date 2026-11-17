import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { getCircleForMember } from "@/lib/data";
import { loadCircleFacts, yearInReview } from "@/lib/core/insights";
import { posterUrl } from "@/lib/tmdb-image";
import { CARD } from "@/lib/card-theme";
import { loadCardFonts } from "@/lib/og-font";
import { pauseBars } from "@/lib/pause-mark";
import { qrDataUri } from "@/lib/qr";
import { siteUrl } from "@/lib/site";
import it from "../../../../../../../../messages/it.json";
import en from "../../../../../../../../messages/en.json";
import es from "../../../../../../../../messages/es.json";

const MESSAGES = { it, en, es };

/**
 * The group's year as a 9:16 image, for stories. Private data: only a member of the Cerchia gets it, and what
 * leaves the app is their choice (the share button). It shows totals and the title of the year, never individual ratings.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/circle/[circleId]/year/[year]/card">) {
  const { circleId, year: yearParam } = await ctx.params;
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) return new Response("Unauthorized", { status: 401 });
  const circle = await getCircleForMember(circleId, session.user.id);
  if (!circle) return new Response("Not found", { status: 404 });
  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return new Response("Bad year", { status: 400 });

  const lp = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  const { people, facts } = await loadCircleFacts(await getDb(), circleId, locale);
  const review = yearInReview(facts, people, year);
  if (review.logs === 0) return new Response("Nothing that year", { status: 404 });

  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "insights.yearCard" });
  const best = review.titleOfTheYear;
  const kicker = t("kicker", { year });
  const stats = [
    t("logs", { count: review.logs }),
    t("titles", { count: review.titles }),
    ...(review.movieHours ? [t("hours", { count: review.movieHours })] : []),
    ...(review.avgRating !== null ? [t("avg", { stars: review.avgRating.toFixed(1) })] : []),
    ...(review.busiestMonth ? [t("month", { month: new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(Date.UTC(year, review.busiestMonth.month - 1, 1))) })] : []),
  ];
  const bestLabel = t("best");
  // The display face draws capitals only: uppercase in code, so the font subset holds the glyphs actually drawn.
  const name = circle.name.toLocaleUpperCase(locale);
  const bestTitle = best ? best.title.toLocaleUpperCase(locale) : "";
  const font = await loadCardFonts({
    display: `${name} ${bestTitle}`,
    body: [kicker, ...stats, bestLabel, "pausa.gnagno.org"].join(" "),
  });
  const poster = best?.posterPath ? posterUrl(best.posterPath, "w500") : null;
  const nameSize = name.length > 30 ? 120 : name.length > 11 ? 160 : 220;
  const bestSize = bestTitle.length > 34 ? 104 : bestTitle.length > 13 ? 140 : 180;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "72px 72px 64px", background: CARD.paper, color: CARD.ink, fontFamily: font.body }}>
        <div style={{ display: "flex", fontSize: 36, lineHeight: 1.2, color: CARD.ink2 }}>{kicker}</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: nameSize, lineHeight: 0.88, fontWeight: 200, fontFamily: font.display, wordBreak: "break-word" }}>{name}</div>

        {/* The poster of the title of the year at its own 2:3, the year's totals as rows beside it. */}
        <div style={{ display: "flex", gap: 40, marginTop: 32 }}>
          <div style={{ display: "flex", width: 520, height: 780, background: CARD.paper3 }}>
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
              <img src={poster} alt="" width={520} height={780} style={{ width: 520, height: 780, objectFit: "cover" }} />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 376, borderBottom: `1px solid ${CARD.rule}` }}>
            {stats.map((s) => (
              <div key={s} style={{ display: "flex", padding: "18px 0", fontSize: 36, lineHeight: 1.2, borderTop: `1px solid ${CARD.rule}` }}>{s}</div>
            ))}
          </div>
        </div>

        {best && <div style={{ display: "flex", marginTop: 36, fontSize: 32, lineHeight: 1.2, color: CARD.ink2 }}>{bestLabel}</div>}
        {best && <div style={{ display: "flex", marginTop: 4, fontSize: bestSize, lineHeight: 0.88, fontWeight: 200, fontFamily: font.display, wordBreak: "break-word" }}>{bestTitle}</div>}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", paddingTop: 28, borderTop: `1px solid ${CARD.rule}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {pauseBars(12, 36, 7)}
            <div style={{ display: "flex", fontSize: 28, color: CARD.muted }}>pausa.gnagno.org</div>
          </div>
          {/* Dark modules on the light plate: a QR printed the other way round does not scan everywhere. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
          <img src={qrDataUri(`${siteUrl()}/${locale}?utm_source=year`, { dark: CARD.paper, light: CARD.ink })} width={120} height={120} alt="" />
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: font.fonts,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
