import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { getCircleFeed, getMembers, getNowWatching } from "@/lib/data";
import { latestRatings, loadCircleFacts, tasteSimilarity } from "@/lib/core/insights";
import { formatProgress } from "@/lib/core/progress";
import { Avatar } from "@/components/avatar";
import { LogCard } from "@/components/log-card";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "person" });
  return { title: t("title"), robots: { index: false } };
}

/** A member's page inside a Cerchia: what they watched, what they loved, how their taste compares to yours. Members only (404 otherwise). */
export default async function Person({ params }: PageProps<"/[locale]/c/[circleId]/p/[userId]">) {
  const { locale, circleId, userId } = await params;
  setRequestLocale(locale);
  const viewer = await requireUser();
  const members = await getMembers(circleId); // the layout already proved the viewer belongs here
  const who = members.find((m) => m.id === userId);
  if (!who) notFound();

  const [t, tk, tf, format, { facts }, recent, watching] = await Promise.all([
    getTranslations("person"), getTranslations("kind"), getTranslations("feed"), getFormatter(),
    getDb().then((db) => loadCircleFacts(db, circleId, locale)),
    getCircleFeed(circleId, viewer.id, locale, 5, undefined, undefined, { by: userId }),
    getNowWatching(circleId, locale, viewer.id),
  ]);
  const now = new Date();
  const mine = facts.filter((f) => f.userId === userId);
  const ratings = latestRatings(facts);
  const rated = [...(ratings.get(userId) ?? new Map<string, number>())];
  const avg = rated.length ? rated.reduce((s, [, r]) => s + r, 0) / rated.length / 2 : null;
  const byMedia = new Map(mine.map((f) => [f.mediaId, f]));
  const favourites = rated.filter(([, r]) => r >= 8).sort((a, b) => b[1] - a[1]).slice(0, 5).flatMap(([id, r]) => (byMedia.get(id) ? [{ f: byMedia.get(id)!, r }] : []));
  const kinds = (["movie", "tv", "anime"] as const).map((k) => [k, new Set(mine.filter((f) => f.kind === k).map((f) => f.mediaId)).size] as const).filter(([, n]) => n > 0);
  const sim = userId !== viewer.id ? tasteSimilarity(ratings.get(viewer.id), ratings.get(userId)) : null;
  const live = watching.find((w) => w.user.id === userId);

  return (
    <main className="grid gap-6 px-4 pb-8 pt-6">
      <Link href={`/c/${circleId}/members`} className="link inline-flex min-h-11 w-fit items-center text-sm">{t("back")}</Link>

      <header className="flex items-center gap-4">
        <Avatar user={who} size={64} />
        <div className="min-w-0">
          <h1 className="display [overflow-wrap:anywhere]">{who.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {who.role === "admin" ? `${t("admin")}, ` : ""}{t("since", { date: format.dateTime(who.joinedAt, { month: "long", year: "numeric" }) })}
          </p>
        </div>
      </header>

      {live && (
        <p className="well grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 p-3">
          <Poster media={live.media} size="sm" />
          <span className="[overflow-wrap:anywhere]">{t("watching", { title: live.media.title })}{formatProgress(live) ? <span className="tabular text-muted"> {formatProgress(live)}</span> : null}</span>
        </p>
      )}

      {/* The figures: three large numbers parted by vertical hairlines, the label under each. */}
      <section aria-label={t("stats")} className="grid grid-cols-3 border-y border-rule py-5">
        <p className="grid min-w-0 gap-1 pr-3"><span className="figure text-display">{mine.length}</span><span className="text-sm text-muted">{t("logs")}</span></p>
        <p className="grid min-w-0 gap-1 border-l border-rule px-3"><span className="figure text-display">{new Set(mine.map((f) => f.mediaId)).size}</span><span className="text-sm text-muted">{t("titles")}</span></p>
        <p className="grid min-w-0 gap-1 border-l border-rule pl-3"><span className="figure text-display">{avg === null ? <span className="text-muted">-</span> : avg.toFixed(1)}</span><span className="text-sm text-muted">{t("avg")}</span></p>
      </section>

      {kinds.length > 0 && <p className="text-sm text-muted">{kinds.map(([k, n]) => `${tk(k)} ${n}`).join(", ")}</p>}

      {sim && (
        <p className="text-ink-2">
          {sim.score === null ? t("tasteNone", { count: sim.common }) : t("taste", { percent: Math.round(sim.score * 100), count: sim.common })}
        </p>
      )}

      {favourites.length > 0 && (
        <section aria-labelledby="loved" className="grid gap-3">
          <h2 id="loved" className="title">{t("loved")}</h2>
          <ul className="-mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:scroll-pl-0 lg:px-0">
            {favourites.map(({ f, r }) => (
              <li key={f.mediaId} className="grid w-[104px] shrink-0 snap-start content-start gap-2">
                <Poster media={{ id: f.mediaId, title: f.title, posterPath: f.posterPath }} />
                <Stars rating={r} label={tf("rating", { stars: r / 2 })} className="text-base!" />
                <span className="sr-only">{f.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent" className="grid gap-3">
        <h2 id="recent" className="title">{t("recent")}</h2>
        {recent.length === 0 ? <p className="plate pt-5 text-ink-2">{t("noLogs")}</p> : <div className="grid">{recent.map((log) => <LogCard key={log.id} log={log} now={now} circleId={circleId} />)}</div>}
        {mine.length > recent.length && (
          <div className="plate grid justify-items-center pt-6">
            <Link href={`/c/${circleId}?by=${userId}`} className="btn">{t("all")}</Link>
          </div>
        )}
      </section>
    </main>
  );
}
