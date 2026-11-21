import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Barlow, Sofia_Sans_Extra_Condensed } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { THEME_COLOR, THEME_COOKIE, THEMES } from "@/lib/theme";
import { siteUrl } from "@/lib/site";
import { splashLinks } from "@/lib/splash";
import { RegisterSw } from "@/components/register-sw";
import "../globals.css";

// Display: Sofia Sans Extra Condensed (200 on heads and figures, 400 on item titles and controls). Text: Barlow.
const sofia = Sofia_Sans_Extra_Condensed({ subsets: ["latin"], variable: "--font-sofia", weight: ["200", "400"] });
const barlow = Barlow({ subsets: ["latin"], variable: "--font-barlow", weight: ["300", "400", "600"] });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: "Pausa", template: "%s · Pausa" },
    description: t("siteDescription"),
    appleWebApp: { capable: true, title: "Pausa", statusBarStyle: "default", startupImage: splashLinks },
  };
}

export const viewport: Viewport = {
  // The app opens dark unless someone pinned a theme: the browser bar takes the dark ground.
  themeColor: THEME_COLOR.dark,
  colorScheme: "dark light",
  // Paint under the notch and the home bar (the sticky bars pad themselves back with env(safe-area-inset-*)), and let the
  // Android keyboard shrink the layout so a field at the bottom stays above it.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Reads the theme cookie and sets data-theme on <html> before anything is painted. Dark when there is none. */
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var v=m&&decodeURIComponent(m[1]);if(${JSON.stringify([...THEMES])}.indexOf(v)>-1)document.documentElement.dataset.theme=v;}catch(e){}})();`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const skip = ({ it: "Vai al contenuto", en: "Skip to content", es: "Saltar al contenido" } as Record<string, string>)[locale] ?? "Skip to content";

  return (
    // The theme is applied by the inline script in <head> before the first paint (no flash), not read here on the server:
    // reading a cookie in the root layout would make every page dynamic, so no public page could be prerendered and cached.
    <html
      lang={locale}
      data-theme="dark"
      suppressHydrationWarning
      className={`${sofia.variable} ${barlow.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <a href="#main" className="skip-link">{skip}</a>
          <div id="main" tabIndex={-1} className="outline-none">{children}</div>
          <RegisterSw />
        </NextIntlClientProvider>
        {/* Cookie-free, aggregate page-view counting by Cloudflare. Off unless a token is configured. */}
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN && (
          <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN })} />
        )}
      </body>
    </html>
  );
}
