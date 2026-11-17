import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { FeedFilters } from "@/lib/data";
import { ChevronDown, Search } from "lucide-react";


/** Search and filters for the diary: a plain GET form (nothing to load, works without JavaScript), kept open while filters are active. */
export async function FilterBar({ circleId, members, filters, qs, year, resultCount, hasMore }: {
  circleId: string; members: { id: string; name: string }[]; filters: FeedFilters; qs: string; year: number; resultCount: number | null; hasMore: boolean;
}) {
  const t = await getTranslations("feed.filter");
  const tk = await getTranslations("kind");
  const active = qs.length > 0;
  return (
    <details open={active} className="group border-y border-rule">
      <summary className="flex min-h-12 list-none items-center gap-3 text-base font-semibold marker:content-none">
        <Search size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="mr-auto">{t("title")}</span>
        {active && <span className="tabular bg-accent px-2 py-0.5 text-sm font-semibold text-accent-ink">{resultCount}{hasMore ? "+" : ""}</span>}
        <ChevronDown size={18} strokeWidth={1.6} aria-hidden="true" className="text-muted transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <form method="get" role="search" className="grid gap-4 pb-5 pt-1">
        <label className="field-label">{t("q")}
          <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={80} className="field" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">{t("kind")}
            <select name="kind" defaultValue={filters.kind ?? ""} className="field">
              <option value="">{t("any")}</option>
              {(["movie", "tv", "anime"] as const).map((k) => <option key={k} value={k}>{tk(k)}</option>)}
            </select>
          </label>
          <label className="field-label">{t("by")}
            <select name="by" defaultValue={filters.by ?? ""} className="field">
              <option value="">{t("everyone")}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="field-label">{t("year")}
            <select name="year" defaultValue={filters.year ?? ""} className="field">
              <option value="">{t("any")}</option>
              {Array.from({ length: 10 }, (_, i) => year - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="field-label">{t("rating")}
            <select name="min" defaultValue={filters.minRating ?? ""} className="field">
              <option value="">{t("any")}</option>
              {[10, 8, 6].map((r) => <option key={r} value={r}>{t("atLeast", { stars: r / 2 })}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary">{t("apply")}</button>
          {active && <Link href={`/c/${circleId}`} className="link inline-flex min-h-11 items-center text-sm">{t("clear")}</Link>}
        </div>
      </form>
    </details>
  );
}
