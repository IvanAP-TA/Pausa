import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { legalDoc } from "@/lib/legal";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  return { title: legalDoc("privacy", locale as Locale).title };
}

export default async function Privacy({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage kind="privacy" locale={locale as Locale} />;
}
