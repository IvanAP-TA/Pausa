import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { tmdbEnabled } from "@/lib/tmdb";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { ImportClient } from "./import-client";

export const metadata = { robots: { index: false } };

/** Import belongs to the personal space: what comes in is private, and is shared with a Cerchia one title at a time. */
export default async function ImportPage({ params }: PageProps<"/[locale]/me/import">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, tc, circles] = await Promise.all([getTranslations("import"), getTranslations("common"), getMyCircles(user.id)]);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  const home = circles.find((c) => c.id === last) ?? circles[0] ?? null;

  return (
    <main className="grid gap-6 px-4 pb-10 pt-2">
      <div className="grid gap-3">
        <Link href="/me" className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
        <p className="text-sm text-muted">{t("visibility")}</p>
      </div>
      <ImportClient circleId={home?.id ?? null} tmdb={tmdbEnabled()} />
    </main>
  );
}
