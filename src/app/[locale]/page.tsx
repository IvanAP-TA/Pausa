import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Landing } from "@/components/landing/landing";

const OG_LOCALE: Record<string, string> = { it: "it_IT", en: "en_US", es: "es_ES" };

/** Per-language title, description and hreflang alternates for the public landing page. */
export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])), "x-default": `/${routing.defaultLocale}` },
    },
    openGraph: { type: "website", title: t("title"), description: t("description"), siteName: "Pausa", locale: OG_LOCALE[locale] ?? locale },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
  };
}

/**
 * The public landing page, prerendered at build time (one static page per language, served from the edge without running
 * the app: no session read, no cookie, no database). Signed-in people are sent on to /home by a tiny check in the browser,
 * and the app, the PWA and sign-in already start at /home.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Landing />;
}
