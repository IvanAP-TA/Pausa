import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Lock, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { listBulkDays, listImportBatches } from "@/lib/core/import-batches";
import { deleteBulkDayAction, deleteImportAction, hideBulkDayAction, removeImportFromCircleAction } from "@/lib/import/actions";
import { ConfirmForm } from "@/components/confirm-form";
import { BackLink } from "@/components/back-link";

export async function generateMetadata({ params }: PageProps<"/[locale]/me/imports">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "imports" });
  return { title: t("title"), robots: { index: false } };
}

const DELETE = "btn btn-sm border-error text-error hover:border-error";

/**
 * Manage imports: every run of the import screen, where it went, and two buttons for a whole run: take it out of the
 * Cerchia it landed in (the viewings stay in the person's own space), or delete its viewings for good. Imports older than
 * the tracking have no run: they show below as the days on which many viewings were added at once, with the same two buttons.
 */
export default async function ImportsPage({ params, searchParams }: PageProps<"/[locale]/me/imports">) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const db = await getDb();
  const [batches, days, t, ti, tc, format] = await Promise.all([
    listImportBatches(db, user.id), listBulkDays(db, user.id),
    getTranslations("imports"), getTranslations("import"), getTranslations("common"), getFormatter(),
  ]);
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,7}$/.test(v) ? Number(v) : null);
  const removed = num(sp.removed);
  const lists = num(sp.lists) ?? 0;
  const deleted = num(sp.deleted);

  return (
    <main className="grid gap-6 px-4 pb-12 pt-2">
      <div className="grid gap-3">
        <BackLink href={"/me"} label={tc("back")} />
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
      </div>

      {removed !== null && <p role="status" className="well p-3 text-sm">{t("removed", { count: removed, lists })}</p>}
      {deleted !== null && <p role="status" className="well p-3 text-sm">{t("deleted", { count: deleted })}</p>}

      {batches.length === 0 && days.length === 0 ? (
        <section className="well empty grid gap-3 p-6">
          <h2 className="title">{t("emptyTitle")}</h2>
          <p className="text-ink-2">{t("emptyBody")}</p>
          <Link href="/me/import" className="btn w-fit">{t("toImport")}</Link>
        </section>
      ) : null}

      {batches.length > 0 && (
        <ul className="rows grid">
          {batches.map((b) => {
            const stillThere = b.inCircle + b.listsInCircle > 0;
            return (
              <li key={b.id} className="grid gap-3 py-5">
                <div className="grid gap-1">
                  <h2 className="title text-xl">{ti(`tabs.${b.source}`)}</h2>
                  <p className="text-sm text-muted">
                    <time dateTime={b.createdAt.toISOString()}>{format.dateTime(b.createdAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                    {" · "}{t("added", { count: b.logs })}
                  </p>
                </div>
                <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                  {b.circle && stillThere ? <Users size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" /> : <Lock size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />}
                  <span className="[overflow-wrap:anywhere]">
                    {b.circle && stillThere ? t("inCircle", { count: b.inCircle, lists: b.listsInCircle, circle: b.circle.name }) : b.circle ? t("takenOut", { circle: b.circle.name }) : t("privateOnly")}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {b.circle && stillThere && (
                    <ConfirmForm
                      action={removeImportFromCircleAction}
                      fields={{ batchId: b.id, locale }}
                      trigger={t("remove", { circle: b.circle.name })}
                      title={t("confirmTitle", { circle: b.circle.name })}
                      body={<><p>{t("confirmBody", { count: b.inCircle, lists: b.listsInCircle, circle: b.circle.name })}</p><p>{t("confirmKeep")}</p></>}
                      confirm={t("confirmCta")}
                      cancel={t("cancel")}
                      pending={t("removing")}
                    />
                  )}
                  {b.logs > 0 && (
                    <ConfirmForm
                      action={deleteImportAction}
                      fields={{ batchId: b.id, locale }}
                      trigger={t("delete", { count: b.logs })}
                      triggerClassName={DELETE}
                      title={t("deleteTitle")}
                      body={<><p>{t("deleteBody", { count: b.logs })}</p><p>{t("deleteKeep")}</p></>}
                      confirm={t("deleteCta")}
                      cancel={t("cancel")}
                      pending={t("deleting")}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {days.length > 0 && (
        <section className="grid gap-3">
          <h2 className="chapter">{t("olderTitle")}</h2>
          <p className="max-w-prose text-sm text-ink-2">{t("olderLede")}</p>
          <ul className="rows grid">
            {days.map((d) => {
              const date = format.dateTime(new Date(`${d.day}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
              return (
                <li key={d.day} className="grid gap-3 py-5">
                  <div className="grid gap-1">
                    <h3 className="title text-xl"><time dateTime={d.day}>{date}</time></h3>
                    <p className="text-sm text-muted">{t("olderAdded", { count: d.logs })}</p>
                  </div>
                  <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                    {d.inCircles > 0 ? <Users size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" /> : <Lock size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />}
                    {d.inCircles > 0 ? t("olderInCircles", { count: d.inCircles }) : t("privateOnly")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {d.inCircles > 0 && (
                      <ConfirmForm
                        action={hideBulkDayAction}
                        fields={{ day: d.day, locale }}
                        trigger={t("olderHide")}
                        title={t("olderHideTitle", { date })}
                        body={<><p>{t("olderHideBody", { count: d.inCircles })}</p><p>{t("olderAll", { count: d.logs })}</p></>}
                        confirm={t("olderHideCta")}
                        cancel={t("cancel")}
                        pending={t("removing")}
                      />
                    )}
                    <ConfirmForm
                      action={deleteBulkDayAction}
                      fields={{ day: d.day, locale }}
                      trigger={t("delete", { count: d.logs })}
                      triggerClassName={DELETE}
                      title={t("olderDeleteTitle", { date })}
                      body={<><p>{t("deleteBody", { count: d.logs })}</p><p>{t("olderAll", { count: d.logs })}</p></>}
                      confirm={t("deleteCta")}
                      cancel={t("cancel")}
                      pending={t("deleting")}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">{t("note")}</p>
    </main>
  );
}
