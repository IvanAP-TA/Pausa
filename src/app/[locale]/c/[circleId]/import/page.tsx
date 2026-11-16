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
        <Link href={`/c/${circleId}/members`} className="inline-flex min-h-8 w-fit items-center text-sm text-muted hover:text-ink">← {tc("back")}</Link>
        <h1 className="font-display text-[1.9rem] leading-[1.05]">{t("title")}</h1>
        <p className="text-muted">{t("lede")}</p>
      </div>
      <p className="rounded-md border border-rule bg-paper-2 p-3 text-sm text-muted">{t("visibility")}</p>
      <ImportClient circleId={circleId} tmdb={tmdbEnabled()} />
    </main>
  );
}
