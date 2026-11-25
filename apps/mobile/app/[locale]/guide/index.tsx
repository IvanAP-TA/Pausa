import type { GenerateMetadataFunction } from "expo-server";
import { useLocalSearchParams } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale } from "@/i18n/locales";
import { localeFrom, pageMetadata, templateMetadata } from "@/seo/metadata";
import { GuideIndex } from "@/features/public/Guides";

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const generateMetadata: GenerateMetadataFunction = (_req, params) => {
  const locale = localeFrom(params);
  if (!locale) return templateMetadata;
  const t = publicI18n(locale).t;
  return pageMetadata({ locale, sub: "/guide", title: `${t("guides.indexTitle")} · Pausa`, description: t("guides.indexLede") });
};

export default function GuideIndexRoute() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return isLocale(locale) ? <GuideIndex locale={locale} /> : null;
}
