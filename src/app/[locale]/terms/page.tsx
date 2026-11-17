import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { legalDoc } from "@/lib/legal";
import { LegalPage } from "@/components/legal-page";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  return { title: legalDoc("terms", locale as Locale).title };
}

export default async function Terms({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage kind="terms" locale={locale as Locale} />;
}
