import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleLists } from "@/lib/data";
import { getRecentSerate } from "@/lib/serata/server";
import { tmdbEnabled } from "@/lib/tmdb";
import { NewSerata } from "./new-serata";

export default async function Serata({ params }: PageProps<"/[locale]/c/[circleId]/serata">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  await requireUser();
  const [lists, recent, t, format] = await Promise.all([
    getCircleLists(circleId, locale),
    getRecentSerate(circleId, locale),
    getTranslations("serata"),
    getFormatter(),
  ]);

  // Quick picks: titles already on the group's lists, watchlists first, de-duplicated.
  const seen = new Set<string>();
  const quickPicks = [...lists].sort((a, b) => Number(b.kind === "watchlist") - Number(a.kind === "watchlist"))
    .flatMap((l) => l.items)
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const now = new Date();

  return (
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <header>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("lede")}</p>
      </header>

      <NewSerata circleId={circleId} quickPicks={quickPicks} tmdb={tmdbEnabled()} />

      {recent.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm text-muted">{t("recent")}</h2>
          <ul className="grid">
            {recent.map((r) => (
              <li key={r.code}>
                <Link href={`/s/${r.code}`} className="flex min-h-12 items-center gap-3 border-b border-rule py-2 text-sm hover:bg-paper-2">
                  <span className="min-w-0 flex-1 truncate">
                    {r.status === "done" && r.winner ? t("statusDone", { title: r.winner }) : t(`status.${r.status}`)}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{t(`mode.${r.mode}`)} · {format.relativeTime(r.createdAt, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
