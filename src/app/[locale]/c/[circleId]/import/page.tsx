import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { tmdbEnabled } from "@/lib/tmdb";
import { ImportClient } from "./import-client";

export const metadata = { robots: { index: false } };

export default async function ImportPage({ params }: PageProps<"/[locale]/c/[circleId]/import">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  await requireUser();
  const [t, tc] = await Promise.all([getTranslations("import"), getTranslations("common")]);

  return (
    <main className="grid gap-6 px-4 pb-10 pt-6">
      <div className="grid gap-3">
        <Link href={`/c/${circleId}/members`} className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
        <p className="text-sm text-muted">{t("visibility")}</p>
      </div>
      <ImportClient circleId={circleId} tmdb={tmdbEnabled()} />
    </main>
  );
}
