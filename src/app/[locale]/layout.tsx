import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Barlow, Sofia_Sans_Extra_Condensed } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { THEME_COLOR, THEME_COOKIE, parseTheme } from "@/lib/theme";
import { siteUrl } from "@/lib/site";
import { splashLinks } from "@/lib/splash";
import { RegisterSw } from "@/components/register-sw";
import "../globals.css";

// Display: Sofia Sans Extra Condensed (200 on heads and figures, 400 on item titles and controls). Text: Barlow.
const sofia = Sofia_Sans_Extra_Condensed({ subsets: ["latin"], variable: "--font-sofia", weight: ["200", "400"] });
const barlow = Barlow({ subsets: ["latin"], variable: "--font-barlow", weight: ["300", "400", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Pausa", template: "%s · Pausa" },
  description: "Il diario privato della tua Cerchia.",
  appleWebApp: { capable: true, title: "Pausa", statusBarStyle: "default", startupImage: splashLinks },
};

export const viewport: Viewport = {
  // The app opens dark unless someone pinned a theme: the browser bar takes the dark ground.
  themeColor: THEME_COLOR.dark,
  colorScheme: "dark light",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const skip = ({ it: "Vai al contenuto", en: "Skip to content", es: "Saltar al contenido" } as Record<string, string>)[locale] ?? "Skip to content";
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${sofia.variable} ${barlow.variable}`}
    >
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
