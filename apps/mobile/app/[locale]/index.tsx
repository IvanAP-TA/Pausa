import type { GenerateMetadataFunction } from "expo-server";
import { useLocalSearchParams } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale } from "@/i18n/locales";
import { localeFrom, pageMetadata, templateMetadata } from "@/seo/metadata";
import { Landing } from "@/features/public/Landing";

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const generateMetadata: GenerateMetadataFunction = (_req, params) => {
  const locale = localeFrom(params);
  if (!locale) return templateMetadata;
  const t = publicI18n(locale).t;
  // The landing title is absolute: no "· Pausa" suffix (INVENTORY 1.2).
  return pageMetadata({ locale, sub: "", title: t("landing.meta.title"), description: t("landing.meta.description") });
};

export default function LandingRoute() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return isLocale(locale) ? <Landing locale={locale} /> : null;
}
