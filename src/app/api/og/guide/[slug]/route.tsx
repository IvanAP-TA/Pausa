import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { guideFor, isGuideSlug } from "@/lib/guides";
import { loadGoogleFont } from "@/lib/og-font";

const C = { paper: "#F2EEE5", ink: "#151413", muted: "#5E5A52", accent: "#C9361F", green: "#1F5C45" };

/** The social image of a public guide (1200x630): its title in the poster serif, on paper, with Pausa's two bars. Public and cacheable. */
export async function GET(request: Request, ctx: RouteContext<"/api/og/guide/[slug]">) {
  const { slug } = await ctx.params;
  if (!isGuideSlug(slug)) return new Response("Not found", { status: 404 });
  const lp = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, lp) ? lp : routing.defaultLocale;
  const { title } = guideFor(locale, slug);

  const [display, body] = await Promise.all([
    loadGoogleFont("Gloock", 400, title),
    loadGoogleFont("Instrument Sans", 500, "PAUSA pausa.gnagno.org"),
  ]);
  const size = title.length > 70 ? 54 : title.length > 48 ? 64 : 76;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.paper, padding: "64px 72px", borderLeft: `14px solid ${C.accent}`, fontFamily: body ? "Instrument Sans" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 7 }}>
            <div style={{ width: 12, height: 40, background: C.accent, borderRadius: 3 }} />
            <div style={{ width: 12, height: 40, background: C.accent, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 30, letterSpacing: 5, color: C.ink }}>PAUSA</div>
        </div>
        <div style={{ fontSize: size, lineHeight: 1.08, color: C.ink, fontFamily: display ? "Gloock" : undefined, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: C.muted }}>
          <span>pausa.gnagno.org</span>
          <span style={{ color: C.green }}>→</span>
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
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
    },
  );
}
