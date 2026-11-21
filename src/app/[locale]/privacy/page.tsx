import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LEGAL_DESCRIPTION, legalDoc } from "@/lib/legal";
import { routing } from "@/i18n/routing";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  return {
    title: legalDoc("privacy", locale as Locale).title,
    description: LEGAL_DESCRIPTION.privacy[locale as Locale] ?? LEGAL_DESCRIPTION.privacy.it,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/privacy`])), "x-default": `/${routing.defaultLocale}/privacy` },
    },
  };
}

export default async function Privacy({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage kind="privacy" locale={locale as Locale} />;
}
