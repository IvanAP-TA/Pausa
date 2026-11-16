import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleFeed, getCircleForMember, getCircleStats, getMembers, getNowWatching, getUnreadCount } from "@/lib/data";
import { clearNowWatching } from "@/lib/actions";
import { Avatar } from "@/components/avatar";
import { LogCard } from "@/components/log-card";
import { Poster } from "@/components/poster";

export default async function Feed({ params }: PageProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const now = new Date();

  const [circle, members, stats, watching, feed, unread, t] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getCircleStats(circleId, now.getFullYear()),
    getNowWatching(circleId, locale),
    getCircleFeed(circleId, user.id, locale),
    getUnreadCount(user.id),
    getTranslations("feed"),
  ]);

  return (
    <main className="grid gap-4 pb-6">
      <header className="flex items-center justify-between gap-3 px-4 pt-6">
        <div className="min-w-0">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{circle!.name}</h1>
          <p className="text-xs text-muted">
            {t("members", { count: members.length })} · {t("logsThisYear", { count: stats.logsThisYear })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {members.slice(0, 5).map((m) => <Avatar key={m.id} user={m} className="ring-2 ring-paper" />)}
          </div>
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
                {w.progress ? <span className="tabular text-muted"> {w.progress}</span> : null}
              </span>
              {w.user.id === user.id ? (
                <form action={clearNowWatching} className="ml-auto shrink-0">
                  <button className="min-h-8 rounded-full border border-rule px-3 text-xs text-muted hover:text-ink">{t("stopWatching")}</button>
                </form>
              ) : (
                <span aria-hidden="true" className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
              )}
            </li>
          ))}
        </ul>
      )}

      {feed.length === 0 ? (
        <section className="mx-4 mt-6 grid gap-3 rounded-md border border-dashed border-rule p-6">
          <h2 className="font-display text-xl font-semibold">{t("emptyTitle")}</h2>
          <p className="text-sm text-muted">{t("emptyBody")}</p>
          <Link href={`/c/${circleId}/log`} className="mt-2 inline-flex min-h-11 w-fit items-center rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">
            {t("emptyCta")}
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 px-4">
          {feed.map((log) => <LogCard key={log.id} log={log} now={now} circleId={circleId} />)}
        </div>
      )}
    </main>
  );
}
