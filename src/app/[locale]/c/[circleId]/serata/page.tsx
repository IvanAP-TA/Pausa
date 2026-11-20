import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleLists } from "@/lib/data";
import { getRecentSerate } from "@/lib/serata/server";
import { tmdbEnabled } from "@/lib/tmdb";
import { circleServices } from "@/lib/discover";
import { NewSerata } from "./new-serata";
import { Suspense } from "react";
import { TogetherPicks } from "@/components/together-picks";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("serata"), robots: { index: false } };
}

export default async function Serata({ params }: PageProps<"/[locale]/c/[circleId]/serata">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  await requireUser();
  const [lists, recent, t, ti, format, services] = await Promise.all([
    getCircleLists(circleId, locale),
    getRecentSerate(circleId, locale),
    getTranslations("serata"),
    getTranslations("insights"),
    getFormatter(),
    circleServices(circleId),
  ]);

  // Quick picks: titles already on the group's lists, watchlists first, de-duplicated.
  const seen = new Set<string>();
  const quickPicks = [...lists].sort((a, b) => Number(b.kind === "watchlist") - Number(a.kind === "watchlist"))
    .flatMap((l) => l.items)
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const now = new Date();

  return (
    <main className="grid gap-8 px-4 pb-8 pt-8">
      <header className="min-w-0">
        <h1 className="display">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-ink-2">{t("lede")}</p>
      </header>

      <NewSerata circleId={circleId} quickPicks={quickPicks} tmdb={tmdbEnabled()} services={{ names: services.common.map((p) => p.name), setBy: services.setBy, members: services.members }} />

      {/* The recommendation engine on this group: what someone loved and the others have not seen yet. */}
      <section aria-labelledby="together" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="together" className="chapter">{ti("recs.title")}</h2>
          <p className="max-w-prose text-sm text-muted">{ti("recs.body")}</p>
        </div>
        <Suspense fallback={<div className="skeleton h-32" aria-hidden="true" />}>
          <TogetherPicks circleId={circleId} locale={locale} limit={5} />
        </Suspense>
      </section>

      {recent.length > 0 && (
        <section className="grid gap-3">
          <h2 className="chapter">{t("recent")}</h2>
          <ul className="stagger rows grid">
            {recent.map((r) => (
              <li key={r.code}>
                <Link href={`/s/${r.code}`} className="grid min-h-14 content-center gap-0.5 py-3 transition-colors duration-150 hover:bg-paper-2">
                  <span className="min-w-0 truncate">
                    {r.status === "done" && r.winner ? t("statusDone", { title: r.winner }) : t(`status.${r.status}`)}
                  </span>
                  <span className="tabular text-sm text-muted">{t(`mode.${r.mode}`)}, {format.relativeTime(r.createdAt, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
