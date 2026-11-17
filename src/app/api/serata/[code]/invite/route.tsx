import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getInviteData } from "@/lib/serata/server";
import { posterUrl } from "@/lib/tmdb-image";
import { loadGoogleFont } from "@/lib/og-font";
import it from "../../../../../../messages/it.json";
import en from "../../../../../../messages/en.json";
import es from "../../../../../../messages/es.json";

const MESSAGES = { it, en, es };
const C = { paper: "#FBF8F2", ink: "#151413", muted: "#5E5A52", accent: "#C9361F", empty: "#2F5D62" };

/** The link preview of an open Serata (what WhatsApp shows when the host shares the link): host, mode and a strip of posters. */
export async function GET(request: Request, ctx: RouteContext<"/api/serata/[code]/invite">) {
  const { code } = await ctx.params;
  const lp = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  const data = await getInviteData(code, locale);
  if (!data) return new Response("Not found", { status: 404 });

  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "serata" });
  const headline = t("invite.headline", { host: data.host || "Pausa" });
  const sub = t("invite.sub", { mode: t(`mode.${data.mode}`), count: data.count });
  const cta = t("invite.cta");
  const [display, body] = await Promise.all([
    loadGoogleFont("Gloock", 400, headline),
    loadGoogleFont("Instrument Sans", 500, `${sub} ${cta} pausa.gnagno.org`),
  ]);

  const n = data.posters.length;
  const tile = n <= 1 ? { w: 420, h: 630 } : n === 2 ? { w: 210, h: 630 } : { w: 210, h: 315 };

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.paper, fontFamily: body ? "Instrument Sans" : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, padding: "0 64px", flex: 1, borderLeft: `10px solid ${C.accent}` }}>
          <div style={{ fontSize: 24, color: C.accent, letterSpacing: 4 }}>PAUSA</div>
          <div style={{ fontSize: headline.length > 34 ? 56 : 68, lineHeight: 1.05, color: C.ink, fontFamily: display ? "Gloock" : undefined }}>{headline}</div>
          <div style={{ fontSize: 28, color: C.muted }}>{sub}</div>
          <div style={{ display: "flex", fontSize: 28, color: C.ink, background: C.accent + "22", padding: "12px 24px", borderRadius: 40, alignSelf: "flex-start" }}>{cta}</div>
          <div style={{ fontSize: 20, color: C.muted }}>pausa.gnagno.org</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 420, height: 630, background: C.empty }}>
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
      fonts: [
        ...(body ? [{ name: "Instrument Sans", data: body, weight: 500 as const, style: "normal" as const }] : []),
        ...(display ? [{ name: "Gloock", data: display, weight: 400 as const, style: "normal" as const }] : []),
      ],
      headers: { "Cache-Control": "public, max-age=300" },
    },
  );
}
