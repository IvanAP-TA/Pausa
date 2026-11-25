import type { GenerateMetadataFunction } from "expo-server";
import { useLocalSearchParams } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale } from "@/i18n/locales";
import { localeFrom, pageMetadata, templateMetadata } from "@/seo/metadata";
import { Legal } from "@/features/public/Legal";

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const generateMetadata: GenerateMetadataFunction = (_req, params) => {
  const locale = localeFrom(params);
  if (!locale) return templateMetadata;
  const i18n = publicI18n(locale);
  return pageMetadata({
    locale,
    sub: "/terms",
    title: `${i18n.t("legal.terms.title")} · Pausa`,
    description: i18n.t("legal.terms.description"),
  });
};

export default function TermsRoute() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return isLocale(locale) ? <Legal locale={locale} kind="terms" /> : null;
}
