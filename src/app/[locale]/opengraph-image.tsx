import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { loadGoogleFont } from "@/lib/og-font";
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
  const tagline = TAGLINE[locale];
  const [display, body] = await Promise.all([
    loadGoogleFont("Gloock", 400, `${tagline}Pausa`),
    loadGoogleFont("Instrument Sans", 500, "pausa.gnagno.org"),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F2EEE5", color: "#151413", fontFamily: body ? "Instrument Sans" : undefined }}>
        <div style={{ width: 14, background: "#C9361F" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ width: 16, height: 46, background: "#C9361F", borderRadius: 4 }} />
              <div style={{ width: 16, height: 46, background: "#C9361F", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 52, fontFamily: display ? "Gloock" : undefined }}>Pausa</div>
          </div>
          <div style={{ fontSize: 92, lineHeight: 1.02, maxWidth: 940, fontFamily: display ? "Gloock" : undefined }}>{tagline}</div>
          <div style={{ fontSize: 28, color: "#5E5A52" }}>pausa.gnagno.org</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(body ? [{ name: "Instrument Sans", data: body, weight: 500 as const, style: "normal" as const }] : []),
        ...(display ? [{ name: "Gloock", data: display, weight: 400 as const, style: "normal" as const }] : []),
      ],
    },
  );
}
