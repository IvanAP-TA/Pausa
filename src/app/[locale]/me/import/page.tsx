import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { tmdbEnabled } from "@/lib/tmdb";
import { ImportClient } from "./import-client";
import { BackLink } from "@/components/back-link";

export const metadata = { robots: { index: false } };

/** Import belongs to the personal space: what comes in is private, unless the person picks one of their Cerchie as its destination. */
export default async function ImportPage({ params }: PageProps<"/[locale]/me/import">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, tc, circles] = await Promise.all([getTranslations("import"), getTranslations("common"), getMyCircles(user.id)]);

  return (
    <main className="grid gap-6 px-4 pb-10 pt-2">
      <div className="grid gap-3">
        <BackLink href={"/me"} label={tc("back")} />
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
        <p className="text-sm text-muted">{t("visibility")}</p>
      </div>
      <ImportClient circles={circles.map((c) => ({ id: c.id, name: c.name }))} tmdb={tmdbEnabled()} />
    </main>
  );
}
