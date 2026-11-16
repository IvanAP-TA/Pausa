import { useTranslations } from "next-intl";

/** Required by the TMDB API terms wherever TMDB data is shown. */
export function TmdbAttribution() {
  const t = useTranslations("tmdb");
  return <p className="text-[11px] leading-snug text-muted">{t("attribution")}</p>;
}
