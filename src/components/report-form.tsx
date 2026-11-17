import { useTranslations } from "next-intl";
import { reportAction } from "@/lib/manage-actions";

/** "Report" for a comment or a log written by someone else: a reason, an optional note, and the operators look at it. */
export function ReportForm({ kind, targetId, back }: { kind: "comment" | "log"; targetId: string; back: string }) {
  const t = useTranslations("manage.report");
  return (
    <details className="text-sm text-muted">
      <summary className="inline-flex min-h-11 list-none items-center underline-offset-4 transition-colors duration-150 marker:content-none hover:text-ink hover:underline">{t("button")}</summary>
      <form action={reportAction} className="well mt-1 grid gap-4 p-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        <label className="field-label">{t("reason")}
          <select name="reason" defaultValue="abuse" className="field">
            <option value="abuse">{t("reasons.abuse")}</option>
            <option value="spam">{t("reasons.spam")}</option>
            <option value="privacy">{t("reasons.privacy")}</option>
            <option value="other">{t("reasons.other")}</option>
          </select>
        </label>
        <label className="field-label">{t("note")}
          <textarea name="note" maxLength={500} rows={2} className="field" />
        </label>
        <button className="btn w-full sm:w-fit">{t("send")}</button>
      </form>
    </details>
  );
}
