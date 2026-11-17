import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Gloock, Instrument_Sans } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { siteUrl } from "@/lib/site";
import "../globals.css";

// Display: Gloock (one weight, poster serif). Text: Instrument Sans.
const gloock = Gloock({ subsets: ["latin"], variable: "--font-gloock", weight: "400" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Pausa", template: "%s · Pausa" },
  description: "Il diario privato della tua Cerchia.",
  appleWebApp: { capable: true, title: "Pausa", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EEE5" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1220" },
  ],
  colorScheme: "light dark",
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
      data-theme={theme === "system" ? undefined : theme}
      className={`${gloock.variable} ${instrument.variable}`}
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <a href="#main" className="skip-link">{skip}</a>
          <div id="main" tabIndex={-1} className="outline-none">{children}</div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
