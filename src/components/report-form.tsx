import { useTranslations } from "next-intl";
import { reportAction } from "@/lib/manage-actions";

/** "Report" for a comment or a log written by someone else: a reason, an optional note, and the operators look at it. */
export function ReportForm({ kind, targetId, back }: { kind: "comment" | "log"; targetId: string; back: string }) {
  const t = useTranslations("manage.report");
  return (
    <details className="text-xs text-muted">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center marker:content-none hover:text-ink">{t("button")}</summary>
      <form action={reportAction} className="mt-1 grid gap-2 rounded-md border border-rule bg-paper-2 p-3 text-sm">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        <label className="grid gap-1">{t("reason")}
          <select name="reason" defaultValue="abuse" className="min-h-10 rounded-sm border border-rule bg-paper px-2 text-ink">
            <option value="abuse">{t("reasons.abuse")}</option>
            <option value="spam">{t("reasons.spam")}</option>
            <option value="privacy">{t("reasons.privacy")}</option>
            <option value="other">{t("reasons.other")}</option>
          </select>
        </label>
        <label className="grid gap-1">{t("note")}
          <textarea name="note" maxLength={500} rows={2} className="rounded-sm border border-rule bg-paper p-2 text-ink" />
        </label>
        <button className="min-h-10 w-fit rounded-full border border-rule px-4 font-semibold text-ink hover:bg-paper-3">{t("send")}</button>
      </form>
    </details>
  );
}
