import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FeedLog } from "@/lib/data";
import { formatProgress } from "@/lib/core/progress";
import { Avatar } from "./avatar";
import { Poster } from "./poster";
import { Reactions } from "./reactions";
import { Spoiler } from "./spoiler";
import { Stars } from "./stars";

/**
 * One log, set as a plate on a contact sheet: a hairline above, the poster printed large, the title in display capitals.
 * `circleId` turns the comment count into a link to the thread of the log (omit it on the thread page).
 * `priority` marks the first plate of a screen, whose poster loads at once.
 */
export function LogCard({ log, now, circleId, priority = false }: { log: FeedLog; now: Date; circleId?: string; priority?: boolean }) {
  const t = useTranslations("feed");
  const tk = useTranslations("kind");
  const format = useFormatter();

  const facts = [
    tk(log.media.kind),
    log.media.year ? String(log.media.year) : null,
    log.episode ? formatProgress({ season: log.season, episode: log.episode }) : log.season ? t("season", { n: log.season }) : null,
    log.platform ? t("on", { platform: log.platform }) : null,
  ].filter(Boolean);

  return (
    <article className="plate grid grid-cols-[104px_minmax(0,1fr)] gap-x-4 gap-y-4 py-5 sm:grid-cols-[128px_minmax(0,1fr)]">
      <header className="col-span-full flex items-center gap-2 text-sm text-muted">
        {circleId ? (
          <Link href={`/c/${circleId}/p/${log.author.id}`} className="inline-flex min-h-10 items-center gap-2 text-ink underline-offset-4 hover:underline">
            <Avatar user={log.author} />
            <strong>{log.author.name}</strong>
          </Link>
        ) : (
          <>
            <Avatar user={log.author} />
            <strong className="text-ink">{log.author.name}</strong>
          </>
        )}
        <span>{log.isRewatch ? t("rewatched") : t("watched")}</span>
        <time className="tabular ml-auto" dateTime={log.createdAt.toISOString()}>
          {format.relativeTime(log.createdAt, now)}
        </time>
      </header>

      <Poster media={log.media} priority={priority} />

      <div className="grid min-w-0 content-start gap-2">
        <h3 className="title">{log.media.title}</h3>
        <p className="text-sm text-muted">{facts.join(", ")}</p>
        {log.rating ? (
          <Stars className="mt-1" rating={log.rating} label={t("rating", { stars: log.rating / 2 })} />
        ) : null}
        {log.watchedWith.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted">{t("with")}</span>
            {log.watchedWith.map((w) => (
              <span key={w.id} className="tag">{w.name}</span>
            ))}
          </p>
        )}
      </div>

      {/* The review is the reader's own voice: full width, at lead size. */}
      {log.review ? (
        <div className="col-span-full">
          {log.containsSpoilers ? (
            <Spoiler label={t("spoiler")} subtitle>{log.review}</Spoiler>
          ) : (
            <p className="subtitle">{log.review}</p>
          )}
        </div>
      ) : null}

      <footer className="col-span-full flex flex-wrap items-center justify-between gap-2">
        <Reactions logId={log.id} initial={log.reactions} />
        {circleId ? (
          <Link href={`/c/${circleId}/l/${log.id}`} className="link inline-flex min-h-10 items-center text-sm">
            {t("comments", { count: log.commentCount })}
          </Link>
        ) : (
          <span className="text-sm text-muted">{t("comments", { count: log.commentCount })}</span>
        )}
      </footer>
    </article>
  );
}
