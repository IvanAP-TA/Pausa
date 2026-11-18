import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getComments, getListTargets, getLogInCircle } from "@/lib/data";
import { addComment, addToList } from "@/lib/actions";
import { deleteCommentAction, deleteLogAction, updateCommentAction } from "@/lib/manage-actions";
import { ReportForm } from "@/components/report-form";
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
      <Link href={`/c/${circleId}`} className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>

      <h1 className="sr-only">{log.media.title}</h1>
      <LogCard log={log} now={now} />

      {log.author.id !== user.id && <ReportForm kind="log" targetId={logId} back={`/${locale}/c/${circleId}/l/${logId}`} />}
      {log.author.id === user.id && (
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/c/${circleId}/l/${logId}/edit`} className="btn btn-quiet btn-sm">{tm("edit")}</Link>
          <details>
            <summary className="btn btn-quiet btn-sm list-none text-error marker:content-none">{tm("delete")}</summary>
            <form action={deleteLogAction} className="mt-3 grid justify-items-start gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="logId" value={logId} />
              <input type="hidden" name="circleId" value={circleId} />
              <p className="text-sm text-ink-2">{tm("deleteLogWarn")}</p>
              <button className="btn btn-sm border-error text-error">{tm("deleteConfirm")}</button>
            </form>
          </details>
        </div>
      )}

      {targets.length > 0 && (
        <form action={addToList} className="flex gap-2">
          <input type="hidden" name="mediaId" value={log.media.id} />
          <label htmlFor="listId" className="sr-only">{tl("addTo")}</label>
          <select id="listId" name="listId" required defaultValue="" className="field flex-1">
            <option value="" disabled>{tl("addTo")}</option>
            {targets.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.personal ? ` (${tl("personal")})` : ""}</option>
            ))}
          </select>
          <button className="btn shrink-0">{tl("add")}</button>
        </form>
      )}

      <section className="grid gap-4" aria-labelledby="comments-title">
        <h2 id="comments-title" className="chapter">{t("title")}</h2>
        {comments.length === 0 && <p className="text-ink-2">{t("empty")}</p>}
        <ul className="rows grid">
          {comments.map((c) => (
            <li key={c.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-4">
              <Avatar user={c.author} size={32} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
                  <strong className="text-base text-ink">{c.author.name}</strong>{" "}
                  <time className="tabular" dateTime={c.createdAt.toISOString()}>{format.relativeTime(c.createdAt, now)}</time>
                </p>
                {c.isSpoiler ? <Spoiler label={tf("spoiler")}>{c.body}</Spoiler> : <p className="mt-1 [overflow-wrap:anywhere]">{c.body}</p>}
                {c.author.id !== user.id && <ReportForm kind="comment" targetId={c.id} back={`/${locale}/c/${circleId}/l/${logId}`} />}
                {(c.author.id === user.id || log.author.id === user.id) && (
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    {c.author.id === user.id && (
                      <details>
                        <summary className="btn btn-quiet btn-sm list-none marker:content-none">{tm("edit")}</summary>
                        <form action={updateCommentAction} className="mt-3 grid gap-3">
                          <input type="hidden" name="commentId" value={c.id} />
                          <textarea name="body" required maxLength={2000} rows={3} defaultValue={c.body} aria-label={tm("edit")} className="field" />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-2"><input type="checkbox" name="isSpoiler" defaultChecked={c.isSpoiler} className="size-5 shrink-0 accent-accent" />{t("spoiler")}</label>
                            <button className="btn btn-sm">{tm("saveChanges")}</button>
                          </div>
                        </form>
                      </details>
                    )}
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="commentId" value={c.id} />
                      <button className="btn btn-quiet btn-sm text-error">{tm("delete")}</button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form action={addComment} className="grid gap-3">
          <input type="hidden" name="logId" value={logId} />
          <input type="hidden" name="circleId" value={circleId} />
          <label htmlFor="body" className="sr-only">{t("placeholder")}</label>
          <textarea id="body" name="body" required maxLength={2000} rows={3} placeholder={t("placeholder")} className="field" />
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-2">
              <input type="checkbox" name="isSpoiler" className="size-5 shrink-0 accent-accent" />{t("spoiler")}
            </label>
            <button className="btn btn-primary w-full sm:w-fit">{t("send")}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
