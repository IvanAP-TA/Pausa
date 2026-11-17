import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleFeed, getCircleForMember, getCircleStats, getMembers, getNowWatching, getUnreadCount } from "@/lib/data";
import { advanceWatching, clearNowWatching } from "@/lib/actions";
import { formatProgress } from "@/lib/core/progress";
import { Suspense } from "react";
import { getDb } from "@/db";
import { memoriesFor, onboardingFor } from "@/lib/core/retention";
import { COVER_GLYPH, getCircleSettings } from "@/lib/core/settings";
import { Avatar } from "@/components/avatar";
import { LogCard } from "@/components/log-card";
import { Poster } from "@/components/poster";

const PAGE = 20;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("diary"), robots: { index: false } };
}

export default async function Feed({ params, searchParams }: PageProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  const { before: beforeParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const now = new Date();
  // Older entries: ?before=<ms of the last log shown>.
  const beforeMs = typeof beforeParam === "string" ? Number(beforeParam) : NaN;
  const before = Number.isFinite(beforeMs) ? new Date(beforeMs) : undefined;

  const [circle, members, stats, watching, feed, unread, t, ta, about] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getCircleStats(circleId, now.getFullYear()),
    getNowWatching(circleId, locale, user.id),
    // One extra row tells us whether there is a next page.
    getCircleFeed(circleId, user.id, locale, PAGE + 1, undefined, before),
    getUnreadCount(user.id),
    getTranslations("feed"),
    getTranslations("account"),
    getDb().then((db) => getCircleSettings(db, circleId, user.id)),
  ]);
  const coverGlyph = about?.cover ? COVER_GLYPH[about.cover] : null;

  return (
    <main className="grid gap-4 pb-6">
      <header className="flex items-center justify-between gap-3 px-4 pt-6">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{coverGlyph && <span aria-hidden="true" className="mr-2">{coverGlyph}</span>}{circle!.name}</h1>
          {about?.description && <p className="mt-0.5 max-w-prose text-sm text-muted [overflow-wrap:anywhere]">{about.description}</p>}
          <p className="text-xs text-muted">
            {t("members", { count: members.length })} · {t("logsThisYear", { count: stats.logsThisYear })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {members.slice(0, 5).map((m) => <Avatar key={m.id} user={m} className="ring-2 ring-paper" />)}
          </div>
          <Link href="/account" aria-label={ta("profile")} className="grid size-11 place-items-center rounded-full hover:bg-paper-2 lg:hidden">
            <Avatar user={{ id: user.id, name: user.name, image: user.image }} size={30} />
          </Link>
          <Link
            href={`/c/${circleId}/notifications`}
            aria-label={unread ? t("unread", { count: unread }) : t("notifications")}
            className="relative grid size-11 place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
            </svg>
            {unread > 0 && (
              <span aria-hidden="true" className="tabular absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-on-accent">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      {watching.length > 0 && (
        <ul className="grid gap-2 px-4">
          {watching.map((w) => (
            <li key={w.user.id} className="flex items-center gap-3 rounded-md bg-paper-2 p-3 text-[13px]">
              <Poster media={w.media} size="sm" className="w-9 shrink-0" />
              <span className="min-w-0">
                <strong className="font-semibold">{w.user.name}</strong> {t("isWatching")}{" "}
                <strong className="font-semibold">{w.media.title}</strong>
                {formatProgress(w) ? <span className="tabular text-muted"> {formatProgress(w)}</span> : null}
              </span>
              {w.user.id === user.id ? (
                <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                  {w.media.kind !== "movie" && (
                    <>
                      <form action={advanceWatching}>
                        <button className="min-h-9 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover">{t("nextEpisode")}</button>
                      </form>
                      <form action={advanceWatching}>
                        <input type="hidden" name="what" value="season" />
                        <button className="min-h-9 rounded-full border border-rule px-3 text-xs text-muted hover:text-ink">{t("nextSeason")}</button>
                      </form>
                    </>
                  )}
                  <form action={clearNowWatching}>
                    <button className="min-h-9 rounded-full border border-rule px-3 text-xs text-muted hover:text-ink">{t("stopWatching")}</button>
                  </form>
                </div>
              ) : (
                <span aria-hidden="true" className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
              )}
            </li>
          ))}
        </ul>
      )}

      {!before && (
        <Suspense fallback={null}>
          <Extras circleId={circleId} userId={user.id} locale={locale} now={now} />
        </Suspense>
      )}

      {feed.length === 0 && before ? (
        <p className="px-4 text-sm text-muted">{t("endOfFeed")}</p>
      ) : feed.length === 0 ? (
        <section className="mx-4 mt-6 grid gap-3 rounded-md border border-dashed border-rule p-6">
          <h2 className="font-display text-xl font-semibold">{t("emptyTitle")}</h2>
          <p className="text-sm text-muted">{t("emptyBody")}</p>
          <Link href={`/c/${circleId}/log`} className="mt-2 inline-flex min-h-11 w-fit items-center rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">
            {t("emptyCta")}
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 px-4">
          {feed.slice(0, PAGE).map((log) => <LogCard key={log.id} log={log} now={now} circleId={circleId} />)}
          {feed.length > PAGE && (
            <Link href={`/c/${circleId}?before=${feed[PAGE - 1].createdAt.getTime()}`} className="inline-flex min-h-11 w-fit items-center justify-self-center rounded-full border border-rule px-5 text-sm font-semibold hover:bg-paper-2">
              {t("older")}
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

/** First steps and memories: nice to have, never in the way. They stream in after the feed. */
async function Extras({ circleId, userId, locale, now }: { circleId: string; userId: string; locale: string; now: Date }) {
  const db = await getDb();
  const [memories, onboarding, tr] = await Promise.all([memoriesFor(db, circleId, now, { locale }), onboardingFor(db, circleId, userId), getTranslations("retention")]);
  return (
    <>
        {onboarding && !onboarding.done && (
          <section aria-labelledby="first-steps" className="mx-4 grid gap-2 rounded-md bg-second-deep p-4 text-on-second">
            <h2 id="first-steps" className="font-display text-lg">{tr("firstStepsTitle")}</h2>
            <ul className="grid gap-1.5 text-sm">
              {([
                ["hasLog", tr("stepLog"), `/c/${circleId}/log`],
                ["hasCompany", tr("stepInvite"), `/c/${circleId}/members`],
                ["hasSerata", tr("stepSerata"), `/c/${circleId}/serata`],
              ] as const).map(([key, label, href]) => (
                <li key={key}>
                  {onboarding[key] ? (
                    <span className="flex min-h-9 items-center gap-2 text-on-second-muted line-through"><span aria-hidden="true">✓</span>{label}</span>
                  ) : (
                    <Link href={href} className="flex min-h-9 items-center gap-2 font-semibold underline-offset-4 hover:underline"><span aria-hidden="true">○</span>{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {memories.length > 0 && (
          <section aria-labelledby="memories" className="mx-4 grid gap-3">
            <h2 id="memories" className="font-display text-lg">{tr("memoriesTitle")}</h2>
            <ul className="grid gap-2">
              {memories.map((m) => (
                <li key={m.logId}>
                  <Link href={`/c/${circleId}/l/${m.logId}`} className="flex gap-3 rounded-md border border-rule bg-paper-2 p-3 hover:border-muted">
                    <Poster media={{ id: m.mediaId, title: m.title, posterPath: m.posterPath }} size="sm" className="w-12 shrink-0" />
                    <span className="min-w-0 text-[13px]">
                      <span className="text-xs text-accent">{tr("yearsAgo", { count: m.yearsAgo })}</span>
                      <span className="block"><strong className="font-semibold">{m.author.name}</strong> {tr("saw")} <strong className="font-semibold">{m.title}</strong></span>
                      {m.review && <span className="subtitle mt-1 block line-clamp-2 text-[13px]">{m.review}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

    </>
  );
}
