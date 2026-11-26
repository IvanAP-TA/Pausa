import { Redirect, useLocalSearchParams } from "expo-router";
import { useI18n } from "@/i18n";
import { privateMetadata } from "@/seo/metadata";

// Old address of the diary: it now lives at /c/{id}, as in v1. Kept so saved links and notices still land.
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { href } = useI18n();
  const query = typeof window === "undefined" ? "" : window.location.search;
  return <Redirect href={`${href(`/c/${id}`)}${query}` as never} />;
}
