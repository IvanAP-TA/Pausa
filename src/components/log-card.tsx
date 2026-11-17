import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FeedLog } from "@/lib/data";
import { Avatar } from "./avatar";
import { Poster } from "./poster";
import { Reactions } from "./reactions";
import { Spoiler } from "./spoiler";
import { Stars } from "./stars";

/** `circleId` turns the comment count into a link to the log's thread (omit it on the thread page). */
export function LogCard({ log, now, circleId }: { log: FeedLog; now: Date; circleId?: string }) {
  const t = useTranslations("feed");
  const tk = useTranslations("kind");
  const format = useFormatter();

  return (
    <article className="ticket grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md bg-paper-2 p-4">
      <header className="col-span-full flex items-center gap-2 text-[13px] text-muted">
        <Avatar user={log.author} />
        <strong className="font-semibold text-ink">{log.author.name}</strong>
        <span>{log.isRewatch ? t("rewatched") : t("watched")}</span>
        <time className="tabular ml-auto text-xs" dateTime={log.createdAt.toISOString()}>
          {format.relativeTime(log.createdAt, now)}
        </time>
      </header>

      <Poster media={log.media} />

      <div className="min-w-0">
        <h3 className="font-display text-[1.45rem] leading-tight">{log.media.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {tk(log.media.kind)}
          {log.media.year ? ` · ${log.media.year}` : ""}
          {log.season ? ` · ${t("season", { n: log.season })}` : ""}
          {log.platform ? ` · ${t("on", { platform: log.platform })}` : ""}
        </p>
        {log.rating ? (
          <Stars className="mt-1.5" rating={log.rating} label={t("rating", { stars: log.rating / 2 })} />
        ) : null}
      </div>

      {/* The review reads like a subtitle, across the whole card. */}
      {log.review ? (
        <div className="col-span-full">
          {log.containsSpoilers ? (
            <Spoiler label={t("spoiler")} subtitle>{log.review}</Spoiler>
          ) : (
            <p className="subtitle text-[15px] leading-snug">{log.review}</p>
          )}
        </div>
      ) : null}

      {log.watchedWith.length > 0 && (
        <div className="col-span-full flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{t("with")}</span>
          {log.watchedWith.map((w) => (
            <span key={w.id} className="rounded-full bg-second px-2.5 py-0.5 text-xs text-on-second">{w.name}</span>
          ))}
        </div>
      )}

      <footer className="col-span-full flex flex-wrap items-center justify-between gap-2">
        <Reactions logId={log.id} initial={log.reactions} />
        {circleId ? (
          <Link href={`/c/${circleId}/l/${log.id}`} className="inline-flex min-h-8 items-center text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("comments", { count: log.commentCount })}
          </Link>
        ) : (
          <span className="text-xs text-muted">{t("comments", { count: log.commentCount })}</span>
        )}
      </footer>
    </article>
  );
}
