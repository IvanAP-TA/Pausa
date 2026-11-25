import type { GenerateMetadataFunction } from "expo-server";
import { useLocalSearchParams } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale } from "@/i18n/locales";
import { localeFrom, pageMetadata, templateMetadata } from "@/seo/metadata";
import { GUIDE_SLUGS } from "@/seo/site";
import { GuidePage, isoDateTime, type Guide } from "@/features/public/Guides";

export const generateStaticParams = () => LOCALES.flatMap((locale) => GUIDE_SLUGS.map((slug) => ({ locale, slug })));

export const generateMetadata: GenerateMetadataFunction = (_req, params) => {
  const locale = localeFrom(params);
  if (!locale) return templateMetadata;
  const slug = String(params.slug);
  const i18n = publicI18n(locale);
  const g = i18n.raw<Guide | undefined>(`guides.items.${slug}`);
  if (!g) return { title: "404 · Pausa", robots: { index: false, follow: false } };
  return pageMetadata({
    locale,
    sub: `/guide/${slug}`,
    title: `${g.title} · Pausa`,
    description: g.description,
    type: "article",
    publishedTime: isoDateTime(i18n.t("guides.updatedOn")),
  });
};

export default function GuideRoute() {
  const { locale, slug } = useLocalSearchParams<{ locale: string; slug: string }>();
  // An unknown slug has no static page, so the host answers 404 before this runs; the check covers client-side navigation.
  if (!isLocale(locale) || !GUIDE_SLUGS.includes(String(slug))) return null;
  return <GuidePage locale={locale} slug={String(slug)} />;
}
