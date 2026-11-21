import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LEGAL_DESCRIPTION, legalDoc } from "@/lib/legal";
import { routing } from "@/i18n/routing";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return {
    title: legalDoc("terms", locale as Locale).title,
    description: LEGAL_DESCRIPTION.terms[locale as Locale] ?? LEGAL_DESCRIPTION.terms.it,
    alternates: {
      canonical: `/${locale}/terms`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/terms`])), "x-default": `/${routing.defaultLocale}/terms` },
    },
  };
}

export default async function Terms({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage kind="terms" locale={locale as Locale} />;
}
