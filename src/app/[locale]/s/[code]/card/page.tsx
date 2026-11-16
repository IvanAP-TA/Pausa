import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getCardData } from "@/lib/serata/server";
import { SerataCard } from "@/components/serata-card";
import { TmdbAttribution } from "@/components/tmdb-attribution";

/** Public result page: what people see when a Card link is shared outside the Cerchia. */
export async function generateMetadata({ params }: PageProps<"/[locale]/s/[code]/card">) {
  const { locale, code } = await params;
  const card = await getCardData(code, locale);
  if (!card) return {};
  const t = await getTranslations({ locale, namespace: "serata.result" });
  const title = `${t("kicker")}: ${card.winner.title}`;
  const image = `/api/serata/${code}/card?locale=${locale}&format=og`;
  return {
    title,
    robots: { index: false },
    openGraph: { title, siteName: "Pausa", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function CardPage({ params }: PageProps<"/[locale]/s/[code]/card">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const card = await getCardData(code, locale);
  if (!card) notFound();
  const [t, ts, format] = await Promise.all([getTranslations("serata.result"), getTranslations("serata"), getFormatter()]);

  const lines = [
    [card.circleName, format.dateTime(card.finishedAt, { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · "),
    [ts(`mode.${card.mode}`), card.mode === "bracket" ? t("rounds", { count: card.rounds }) : null, t("people", { count: card.voters })].filter(Boolean).join(" · "),
  ];

  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-8">
      <SerataCard kicker={t("kicker")} subtitle={t("subtitle")} title={card.winner.title} posterPath={card.winner.posterPath} lines={lines} />
      <p className="text-center text-sm text-muted">{t("cta")}</p>
      <a href={`/${locale}/sign-in`} className="grid min-h-12 place-items-center rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover">
        {t("ctaButton")}
      </a>
      <TmdbAttribution />
    </main>
  );
}
