import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { getCircleForMember } from "@/lib/data";
import { loadCircleFacts, yearInReview } from "@/lib/core/insights";
import { posterUrl } from "@/lib/tmdb-image";
import { loadGoogleFont } from "@/lib/og-font";
import it from "../../../../../../../../messages/it.json";
import en from "../../../../../../../../messages/en.json";
import es from "../../../../../../../../messages/es.json";

const MESSAGES = { it, en, es };
const C = { paper: "#FBF8F2", ink: "#151413", muted: "#5E5A52", accent: "#C9361F", empty: "#2F5D62" };

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
  ];
  const bestLabel = t("best");
  const [display, body] = await Promise.all([
    loadGoogleFont("Gloock", 400, `${circle.name} ${best?.title ?? ""} ${year}`),
    loadGoogleFont("Instrument Sans", 500, [kicker, ...stats, bestLabel, "pausa.gnagno.org"].join(" ")),
  ]);
  const poster = best?.posterPath ? posterUrl(best.posterPath, "w500") : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.paper, color: C.ink, fontFamily: body ? "Instrument Sans" : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 20, padding: "110px 80px 50px" }}>
          <div style={{ fontSize: 34, color: C.accent, letterSpacing: 5 }}>{kicker.toUpperCase()}</div>
          <div style={{ fontSize: circle.name.length > 18 ? 100 : 128, lineHeight: 1.02, fontFamily: display ? "Gloock" : undefined }}>{circle.name}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 46, marginTop: 24 }}>
            {stats.map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, background: C.empty, position: "relative" }}>
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
            <img src={poster} alt="" width={1080} height={900} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "40px 80px 56px", borderTop: `10px solid ${C.accent}` }}>
          {best && <div style={{ fontSize: 30, color: C.accent }}>{bestLabel}</div>}
          {best && <div style={{ fontSize: best.title.length > 22 ? 80 : 100, lineHeight: 1.02, fontFamily: display ? "Gloock" : undefined }}>{best.title}</div>}
          <div style={{ fontSize: 28, color: C.muted, marginTop: 10 }}>pausa.gnagno.org</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        ...(body ? [{ name: "Instrument Sans", data: body, weight: 500 as const, style: "normal" as const }] : []),
        ...(display ? [{ name: "Gloock", data: display, weight: 400 as const, style: "normal" as const }] : []),
      ],
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
