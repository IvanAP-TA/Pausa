import { Redirect, useLocalSearchParams } from "expo-router";
import { DEFAULT_LOCALE, isLocale } from "@/i18n";
import { privateMetadata } from "@/seo/metadata";

export const generateMetadata = () => privateMetadata("Pausa");

/** The account page moved under the profile (/me/account); old links and bookmarks still work. */
export default function Screen() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return <Redirect href={`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/me/account`} />;
}
