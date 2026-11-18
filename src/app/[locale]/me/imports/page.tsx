import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Lock, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { listImportBatches } from "@/lib/core/import-batches";
import { removeImportFromCircleAction } from "@/lib/import/actions";
import { ConfirmForm } from "@/components/confirm-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/me/imports">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "imports" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Manage imports: every run of the import screen, where it went, and the one button that takes a whole run out of the
 * Cerchia it landed in. Nothing is deleted: the viewings stay in the person's own space.
 */
export default async function ImportsPage({ params, searchParams }: PageProps<"/[locale]/me/imports">) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [batches, t, ti, tc, format] = await Promise.all([
    listImportBatches(await getDb(), user.id), getTranslations("imports"), getTranslations("import"), getTranslations("common"), getFormatter(),
  ]);
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,7}$/.test(v) ? Number(v) : null);
  const removed = num(sp.removed);
  const lists = num(sp.lists) ?? 0;

  return (
    <main className="grid gap-6 px-4 pb-12 pt-2">
      <div className="grid gap-3">
        <Link href="/me" className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
      </div>

      {removed !== null && <p role="status" className="well p-3 text-sm">{t("removed", { count: removed, lists })}</p>}

      {batches.length === 0 ? (
        <section className="well empty grid gap-3 p-6">
          <h2 className="title">{t("emptyTitle")}</h2>
          <p className="text-ink-2">{t("emptyBody")}</p>
          <Link href="/me/import" className="btn w-fit">{t("toImport")}</Link>
        </section>
      ) : (
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
                {b.circle && stillThere ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                      <Users size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                      <span className="[overflow-wrap:anywhere]">{t("inCircle", { count: b.inCircle, lists: b.listsInCircle, circle: b.circle.name })}</span>
                    </p>
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
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-ink-2">
                    <Lock size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                    {b.circle ? t("takenOut", { circle: b.circle.name }) : t("privateOnly")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-muted">{t("note")}</p>
    </main>
  );
}
