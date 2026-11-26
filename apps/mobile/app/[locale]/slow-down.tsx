import type { GenerateMetadataFunction } from "expo-server";
import { useLocalSearchParams } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale } from "@/i18n/locales";
import { localeFrom, privateMetadata, templateMetadata } from "@/seo/metadata";
import { ErrorPage } from "@/features/public/ErrorPage";

// Where a person lands after doing something too many times in an hour (see crates/core limits). Static, no JavaScript, noindex.
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const generateMetadata: GenerateMetadataFunction = (_req, params) => {
  const locale = localeFrom(params);
  if (!locale) return templateMetadata;
  return privateMetadata(`${publicI18n(locale).t("errors.slowTitle")} · Pausa`);
};

export default function SlowDownRoute() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return isLocale(locale) ? <ErrorPage locale={locale} kind="slow" /> : null;
}
