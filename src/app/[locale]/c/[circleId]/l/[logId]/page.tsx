import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getComments, getListTargets, getLogInCircle } from "@/lib/data";
import { addComment, addToList } from "@/lib/actions";
import { deleteCommentAction, deleteLogAction, updateCommentAction } from "@/lib/manage-actions";
import { Avatar } from "@/components/avatar";
import { LogCard } from "@/components/log-card";
import { Spoiler } from "@/components/spoiler";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("diary"), robots: { index: false } };
}

export default async function LogThread({ params }: PageProps<"/[locale]/c/[circleId]/l/[logId]">) {
  const { locale, circleId, logId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const log = await getLogInCircle(circleId, logId, user.id, locale);
  if (!log) notFound();

  const [comments, targets, t, tc, tl, tf, tm, format] = await Promise.all([
    getComments(logId),
    getListTargets(circleId, user.id),
    getTranslations("comments"),
    getTranslations("common"),
    getTranslations("lists"),
    getTranslations("feed"),
    getTranslations("manage"),
    getFormatter(),
  ]);
  const now = new Date();

  return (
    <main className="grid gap-6 px-4 pb-8 pt-6">
      <Link href={`/c/${circleId}`} className="inline-flex min-h-10 w-fit items-center text-sm text-muted hover:text-ink">← {tc("back")}</Link>

      <h1 className="sr-only">{log.media.title}</h1>
      <LogCard log={log} now={now} />

      {log.author.id === user.id && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/c/${circleId}/l/${logId}/edit`} className="inline-flex min-h-9 items-center rounded-full border border-rule px-4 text-sm font-semibold hover:bg-paper-2">{tm("edit")}</Link>
          <details>
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-rule px-4 text-sm text-muted marker:content-none hover:text-ink">{tm("delete")}</summary>
            <form action={deleteLogAction} className="mt-2 flex flex-wrap items-center gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="logId" value={logId} />
              <input type="hidden" name="circleId" value={circleId} />
              <p className="text-sm text-muted">{tm("deleteLogWarn")}</p>
              <button className="min-h-9 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">{tm("deleteConfirm")}</button>
            </form>
          </details>
        </div>
      )}

      {targets.length > 0 && (
        <form action={addToList} className="flex gap-2">
          <input type="hidden" name="mediaId" value={log.media.id} />
          <label htmlFor="listId" className="sr-only">{tl("addTo")}</label>
          <select id="listId" name="listId" required defaultValue="" className="min-h-11 min-w-0 flex-1 rounded-sm border border-rule bg-paper-2 px-3 text-sm">
            <option value="" disabled>{tl("addTo")}</option>
            {targets.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.personal ? ` (${tl("personal")})` : ""}</option>
            ))}
          </select>
          <button className="min-h-11 shrink-0 rounded-full border border-rule bg-paper-3 px-4 text-sm font-semibold hover:bg-rule">{tl("add")}</button>
        </form>
      )}

      <section className="grid gap-4" aria-labelledby="comments-title">
        <h2 id="comments-title" className="font-display text-xl font-semibold">{t("title")}</h2>
        {comments.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
        <ul className="grid gap-4">
          {comments.map((c) => (
            <li key={c.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
              <Avatar user={c.author} size={32} />
              <div className="min-w-0">
                <p className="text-[13px] text-muted">
                  <strong className="font-semibold text-ink">{c.author.name}</strong>{" "}
                  <time className="tabular" dateTime={c.createdAt.toISOString()}>{format.relativeTime(c.createdAt, now)}</time>
                </p>
                {c.isSpoiler ? <Spoiler label={tf("spoiler")}>{c.body}</Spoiler> : <p className="mt-0.5 text-sm [overflow-wrap:anywhere]">{c.body}</p>}
                {(c.author.id === user.id || log.author.id === user.id) && (
                  <div className="mt-1 flex flex-wrap items-start gap-3 text-xs text-muted">
                    {c.author.id === user.id && (
                      <details>
                        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center marker:content-none hover:text-ink">{tm("edit")}</summary>
                        <form action={updateCommentAction} className="mt-1 grid gap-2">
                          <input type="hidden" name="commentId" value={c.id} />
                          <textarea name="body" required maxLength={2000} rows={3} defaultValue={c.body} aria-label={tm("edit")} className="rounded-sm border border-rule bg-paper-2 p-2 text-sm text-ink" />
                          <div className="flex items-center gap-3">
                            <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="isSpoiler" defaultChecked={c.isSpoiler} className="size-4 accent-[var(--color-accent)]" />{t("spoiler")}</label>
                            <button className="min-h-10 rounded-full border border-rule px-3 font-semibold text-ink">{tm("saveChanges")}</button>
                          </div>
                        </form>
                      </details>
                    )}
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="commentId" value={c.id} />
                      <button className="inline-flex min-h-10 items-center hover:text-accent">{tm("delete")}</button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form action={addComment} className="grid gap-2 border-t border-rule pt-4">
          <input type="hidden" name="logId" value={logId} />
          <input type="hidden" name="circleId" value={circleId} />
          <label htmlFor="body" className="sr-only">{t("placeholder")}</label>
          <textarea id="body" name="body" required maxLength={2000} rows={3} placeholder={t("placeholder")}
            className="rounded-sm border border-rule bg-paper-2 p-3 text-[15px] placeholder:text-muted/70" />
          <div className="flex items-center justify-between gap-3">
            <label className="flex min-h-10 items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="isSpoiler" className="size-5 accent-[var(--color-accent)]" />{t("spoiler")}
            </label>
            <button className="min-h-11 rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">{t("send")}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
