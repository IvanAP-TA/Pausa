import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { FeedFilters } from "@/lib/data";

const field = "min-h-11 min-w-0 rounded-sm border border-rule bg-paper px-2 text-sm text-ink";

/** Search and filters for the diary: a plain GET form (nothing to load, works without JavaScript), kept open while filters are active. */
export async function FilterBar({ circleId, members, filters, qs, year, resultCount, hasMore }: {
  circleId: string; members: { id: string; name: string }[]; filters: FeedFilters; qs: string; year: number; resultCount: number | null; hasMore: boolean;
}) {
  const t = await getTranslations("feed.filter");
  const tk = await getTranslations("kind");
  const active = qs.length > 0;
  return (
    <details open={active} className="mx-4 rounded-md border border-rule bg-paper-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold marker:content-none">
        <span>{t("title")}</span>
        {active && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">{resultCount}{hasMore ? "+" : ""}</span>}
      </summary>
      <form method="get" role="search" className="grid gap-3 border-t border-rule p-4">
        <label className="grid gap-1 text-xs text-muted">{t("q")}
          <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={80} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs text-muted">{t("kind")}
            <select name="kind" defaultValue={filters.kind ?? ""} className={field}>
              <option value="">{t("any")}</option>
              {(["movie", "tv", "anime"] as const).map((k) => <option key={k} value={k}>{tk(k)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">{t("by")}
            <select name="by" defaultValue={filters.by ?? ""} className={field}>
              <option value="">{t("everyone")}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">{t("year")}
            <select name="year" defaultValue={filters.year ?? ""} className={field}>
              <option value="">{t("any")}</option>
              {Array.from({ length: 10 }, (_, i) => year - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">{t("rating")}
            <select name="min" defaultValue={filters.minRating ?? ""} className={field}>
              <option value="">{t("any")}</option>
              {[10, 8, 6].map((r) => <option key={r} value={r}>{t("atLeast", { stars: r / 2 })}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover">{t("apply")}</button>
          {active && <Link href={`/c/${circleId}`} className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-ink">{t("clear")}</Link>}
        </div>
      </form>
    </details>
  );
}
