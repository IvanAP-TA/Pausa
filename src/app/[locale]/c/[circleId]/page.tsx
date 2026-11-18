import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { FilterBar } from "./filter-bar";
import { getCircleFeed, getCircleForMember, getCircleStats, getMembers, getMyCircleSettings, getNowWatching, getUnreadCount, type FeedFilters } from "@/lib/data";
import { advanceWatching, clearNowWatching } from "@/lib/actions";
import { formatProgress } from "@/lib/core/progress";
import { Suspense } from "react";
import { getDb } from "@/db";
import { memoriesFor, onboardingFor } from "@/lib/core/retention";
import { COVER_GLYPH } from "@/lib/core/settings";
import { Avatar } from "@/components/avatar";
import { PauseMark } from "@/components/brand";
import { LogCard } from "@/components/log-card";
import { Poster } from "@/components/poster";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bell, Check, Trophy } from "lucide-react";
import { Fragment } from "react";

const PAGE = 20;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("diary"), robots: { index: false } };
}

export default async function Feed({ params, searchParams }: PageProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  const sp = await searchParams;
  const { before: beforeParam } = sp;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  setRequestLocale(locale);
  const user = await requireUser();
  const now = new Date();
  // Older entries: ?before=<ms of the last log shown>.
  const beforeMs = typeof beforeParam === "string" ? Number(beforeParam) : NaN;
  const before = Number.isFinite(beforeMs) ? new Date(beforeMs) : undefined;
  // Search and filters (all from the address, so a filtered view can be shared and the back button works).
  const kind = (["movie", "tv", "anime"] as const).find((k) => k === one("kind"));
  const year = Number(one("year")) || undefined;
  const minRating = Number(one("min")) || undefined;
  const filters: FeedFilters = { q: one("q")?.slice(0, 80) || undefined, kind, by: one("by"), year: year && year > 1900 && year < 2200 ? year : undefined, minRating: minRating && minRating >= 1 && minRating <= 10 ? minRating : undefined };
  const filtered = Object.values(filters).some(Boolean);
  const qs = new URLSearchParams(Object.entries({ q: filters.q, kind: filters.kind, by: filters.by, year: filters.year, min: filters.minRating }).flatMap(([k, v]) => (v ? [[k, String(v)]] : []))).toString();

  const [circle, members, stats, watching, feed, unread, t, ta, about, tt, format] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getCircleStats(circleId, now.getFullYear()),
    getNowWatching(circleId, locale, user.id),
    // One extra row tells us whether there is a next page.
    getCircleFeed(circleId, user.id, locale, PAGE + 1, undefined, before, filters),
    getUnreadCount(user.id),
    getTranslations("feed"),
    getTranslations("account"),
    getMyCircleSettings(circleId, user.id),
    getTranslations("tabs"),
    getFormatter(),
  ]);
  const coverGlyph = about?.cover ? COVER_GLYPH[about.cover] : null;

  // The diary is cut into days: each day opens with its date, set as a figure. Days are told apart in the app's time zone.
  const dayKey = (d: Date) => format.dateTime(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  const nearDay = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dayName = (d: Date) =>
    dayKey(d) === dayKey(now) ? nearDay.format(0, "day")
    : dayKey(d) === dayKey(yesterday) ? nearDay.format(-1, "day")
    : format.dateTime(d, { weekday: "long" });

  return (
    <main className="grid gap-6 px-4 pb-8 max-lg:!pt-0">
      <header className="-mt-14 grid gap-3 lg:mt-0 lg:gap-5 lg:pt-6">
        {/* The tools sit at the far end of the mast (on a phone the layout draws the wordmark on the same line). */}
        <div className="pointer-events-none flex h-14 items-center justify-end lg:h-auto">
        <div className="pointer-events-auto -mr-2 flex shrink-0 items-center gap-1">
          <div className="mr-2 hidden -space-x-1.5 sm:flex">
            {members.slice(0, 5).map((m) => <Avatar key={m.id} user={m} className="ring-2 ring-paper" />)}
          </div>
          <ThemeToggle />
          <Link href="/account" aria-label={ta("profile")} className="grid size-11 place-items-center transition-colors duration-150 hover:bg-paper-2 lg:hidden">
            <Avatar user={{ id: user.id, name: user.name, image: user.image }} size={30} />
          </Link>
          <Link
            href={`/c/${circleId}/notifications`}
            aria-label={unread ? t("unread", { count: unread }) : t("notifications")}
            className="relative grid size-11 place-items-center text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink"
          >
            <Bell size={22} strokeWidth={1.6} aria-hidden="true" />
            {unread > 0 && (
              <span aria-hidden="true" className="tabular absolute right-0.5 top-0.5 grid min-w-5 place-items-center bg-accent px-1 text-xs font-semibold leading-5 text-accent-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
        </div>
        {/* The name of the Cerchia has the full width of the sheet. */}
        <div className="min-w-0">
          <h1 className="display max-w-none">{coverGlyph && <span aria-hidden="true" className="mr-2">{coverGlyph}</span>}{circle!.name}</h1>
          {about?.description && <p className="mt-2 max-w-prose text-ink-2 [overflow-wrap:anywhere]">{about.description}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="text-sm text-muted">
              {t("members", { count: members.length })}, {t("logsThisYear", { count: stats.logsThisYear })}
            </p>
            <Link href={`/c/${circleId}/ranking`} className="btn btn-sm">
              <Trophy size={18} strokeWidth={1.6} aria-hidden="true" />
              {tt("ranking")}
            </Link>
          </div>
        </div>
      </header>

      {/* On air: who is watching what right now. A strip that scrolls sideways on a phone, each entry a small plate. */}
      {watching.length > 0 && (
        <ul className="-mx-4 flex snap-x scroll-pl-4 gap-0.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:scroll-pl-0 lg:px-0">
          {watching.map((w) => (
            <li key={w.user.id} className="well reel grid w-[min(82vw,20rem)] shrink-0 snap-start grid-cols-[56px_minmax(0,1fr)] gap-3 px-3 py-[26px]">
              <Poster media={w.media} size="sm" />
              <div className="grid min-w-0 content-between gap-2">
                <p className="text-sm">
                  <strong>{w.user.name}</strong> <span className="text-ink-2">{t("isWatching")}</span>
                  <span className="title mt-1 block text-xl">{w.media.title}</span>
                  {formatProgress(w) ? <span className="tabular text-muted">{formatProgress(w)}</span> : null}
                </p>
                {w.user.id === user.id ? (
                  <div className="flex flex-wrap gap-1.5">
                    {w.media.kind !== "movie" && (
                      <>
                        <form action={advanceWatching}>
                          <button className="btn btn-primary btn-sm">{t("nextEpisode")}</button>
                        </form>
                        <form action={advanceWatching}>
                          <input type="hidden" name="what" value="season" />
                          <button className="btn btn-quiet btn-sm">{t("nextSeason")}</button>
                        </form>
                      </>
                    )}
                    <form action={clearNowWatching}>
                      <button className="btn btn-quiet btn-sm">{t("stopWatching")}</button>
                    </form>
                  </div>
                ) : (
                  <span aria-hidden="true" className="size-2 animate-pulse bg-accent motion-reduce:animate-none" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid">
        <FilterBar circleId={circleId} members={members} filters={filters} qs={qs} year={now.getFullYear()} resultCount={filtered ? Math.min(feed.length, PAGE) : null} hasMore={feed.length > PAGE} />
      </div>

      {!before && !filtered && (
        <Suspense fallback={null}>
          <Extras circleId={circleId} userId={user.id} locale={locale} now={now} />
        </Suspense>
      )}

      {feed.length === 0 && filtered ? (
        <p className="plate pt-5 text-ink-2">{t("filter.none")}</p>
      ) : feed.length === 0 && before ? (
        <p className="plate pt-5 text-ink-2">{t("endOfFeed")}</p>
      ) : feed.length === 0 ? (
        <section className="well grained grid gap-3 p-6">
          <PauseMark className="mb-2 h-10" />
          <h2 className="title">{t("emptyTitle")}</h2>
          <p className="text-ink-2">{t("emptyBody")}</p>
          <Link href={`/c/${circleId}/log`} className="btn btn-primary mt-2 w-fit">
            {t("emptyCta")}
          </Link>
        </section>
      ) : (
        <div className="stagger grid">
          {feed.slice(0, PAGE).map((log, i, shown) => (
            <Fragment key={log.id}>
              {(i === 0 || dayKey(shown[i - 1].createdAt) !== dayKey(log.createdAt)) && (
                <h2 className={`day ${i === 0 ? "" : "mt-8"} ${dayKey(log.createdAt) === dayKey(now) ? "day-today" : ""}`}>
                  <time dateTime={log.createdAt.toISOString().slice(0, 10)} className="contents">
                    <span className="figure day-figure">{format.dateTime(log.createdAt, { day: "numeric" })}</span>
                    <span className="day-label">
                      <span className="day-name">{dayName(log.createdAt)}</span>
                      <span>{format.dateTime(log.createdAt, { month: "long", year: "numeric" })}</span>
                    </span>
                  </time>
                </h2>
              )}
              <LogCard log={log} now={now} circleId={circleId} priority={i === 0} />
            </Fragment>
          ))}
          {feed.length > PAGE && (
            <div className="plate grid justify-items-center pt-6">
              <Link href={`/c/${circleId}?before=${feed[PAGE - 1].createdAt.getTime()}${qs ? `&${qs}` : ""}`} className="btn">
                {t("older")}
              </Link>
            </div>
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
        <section aria-labelledby="first-steps" className="well grained grid gap-3 p-5">
          <h2 id="first-steps" className="title">{tr("firstStepsTitle")}</h2>
          <ul className="rows grid text-base">
            {([
              ["hasLog", tr("stepLog"), `/c/${circleId}/log`],
              ["hasCompany", tr("stepInvite"), `/c/${circleId}/members`],
              ["hasSerata", tr("stepSerata"), `/c/${circleId}/serata`],
            ] as const).map(([key, label, href]) => (
              <li key={key}>
                {onboarding[key] ? (
                  <span className="flex min-h-11 items-center gap-3 text-muted line-through">
                    <Check size={18} strokeWidth={1.6} aria-hidden="true" />
                    {label}
                  </span>
                ) : (
                  <Link href={href} className="flex min-h-11 items-center gap-3 font-semibold underline-offset-4 hover:underline">
                    <span aria-hidden="true" className="size-[18px] border border-muted" />
                    {label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {memories.length > 0 && (
        <section aria-labelledby="memories" className="grid gap-3">
          <h2 id="memories" className="chapter">{tr("memoriesTitle")}</h2>
          <ul className="rows grid">
            {memories.map((m) => (
              <li key={m.logId}>
                <Link href={`/c/${circleId}/l/${m.logId}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 py-3 transition-colors duration-150 hover:bg-paper-2">
                  <Poster media={{ id: m.mediaId, title: m.title, posterPath: m.posterPath }} size="sm" />
                  <span className="min-w-0 text-sm">
                    <span className="text-muted">{tr("yearsAgo", { count: m.yearsAgo })}</span>
                    <span className="block text-base"><strong>{m.author.name}</strong> {tr("saw")} <strong>{m.title}</strong></span>
                    {m.review && <span className="mt-1 block line-clamp-2 text-ink-2">{m.review}</span>}
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
