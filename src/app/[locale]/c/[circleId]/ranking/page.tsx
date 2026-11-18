import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { loadCircleFacts } from "@/lib/core/insights";
import { PAGE_SIZE, RANK_SORTS, rankTitles, yearSpan, type RankFilters, type RankSort } from "@/lib/core/ranking";
import { Poster } from "@/components/poster";
import { ChevronDown, Search } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ranking" });
  return { title: t("title"), robots: { index: false } };
}

const int = (v: string | undefined, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/** The Cerchia's ranking: every title anyone logged, each member's rating and the group's average. Members only (the layout 404s others). */
export default async function Ranking({ params, searchParams }: PageProps<"/[locale]/c/[circleId]/ranking">) {
  const { locale, circleId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const me = await requireUser();
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) || undefined; };

  const [{ people, facts }, t, tk] = await Promise.all([
    getDb().then((db) => loadCircleFacts(db, circleId, locale)),
    getTranslations("ranking"), getTranslations("kind"),
  ]);

  const kind = (["movie", "tv", "anime"] as const).find((k) => k === one("kind"));
  const sort = (RANK_SORTS as string[]).includes(one("sort") ?? "") ? (one("sort") as RankSort) : "avg";
  const by = people.some((p) => p.id === one("by")) ? one("by") : undefined;
  // With three or more people a single vote says little: start at two (the menu below shows it and lets you change it).
  const minVotes = int(one("votes"), 0, people.length) ?? (people.length >= 3 ? 2 : 1);
  const filters: RankFilters = {
    q: one("q")?.slice(0, 80), kind, yearFrom: int(one("from"), 1870, 2200), yearTo: int(one("to"), 1870, 2200), minVotes,
    everyone: one("all") === "1", by, sort,
  };
  const all = rankTitles(facts, people, filters);
  const page = int(one("page"), 1, Math.ceil(Math.max(1, all.length) / PAGE_SIZE)) ?? 1;
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const span = yearSpan(facts);
  const hasFilters = Object.entries(sp).some(([k, v]) => k !== "page" && v);

  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && typeof v === "string" && v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/c/${circleId}/ranking${s ? `?${s}` : ""}`;
  };
  // Built once: constructing an Intl.NumberFormat per cell (hundreds per page) cost over a second.
  const nfShort = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const nfFixed = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = (r: number) => nfShort.format(r / 2);
  const first = (name: string) => name.split(/\s+/)[0] ?? name;

  return (
    <main className="grid gap-6 px-4 pb-10 pt-8">
      <header className="grid gap-2">
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
      </header>

      <details open={hasFilters} className="group border-y border-rule">
        <summary className="flex min-h-12 list-none items-center gap-3 text-base font-semibold marker:content-none">
          <Search size={20} strokeWidth={1.6} aria-hidden="true" />
          <span className="mr-auto">{t("filters.title")}</span>
          <span className="tabular text-sm font-normal text-muted">{t("count", { count: all.length })}</span>
          <ChevronDown size={18} strokeWidth={1.6} aria-hidden="true" className="text-muted transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <form method="get" role="search" className="grid gap-4 pb-5 pt-1">
          <label className="field-label">{t("filters.q")}
            <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={80} className="field" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">{t("filters.kind")}
              <select name="kind" defaultValue={kind ?? ""} className="field">
                <option value="">{t("filters.any")}</option>
                {(["movie", "tv", "anime"] as const).map((k) => <option key={k} value={k}>{tk(k)}</option>)}
              </select>
            </label>
            <label className="field-label">{t("filters.by")}
              <select name="by" defaultValue={by ?? ""} className="field">
                <option value="">{t("filters.everyone")}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field-label">{t("filters.from")}
              <input type="number" name="from" min={span?.min ?? 1870} max={span?.max ?? 2200} placeholder={span ? String(span.min) : ""} defaultValue={filters.yearFrom ?? ""} inputMode="numeric" className="field tabular" />
            </label>
            <label className="field-label">{t("filters.to")}
              <input type="number" name="to" min={span?.min ?? 1870} max={span?.max ?? 2200} placeholder={span ? String(span.max) : ""} defaultValue={filters.yearTo ?? ""} inputMode="numeric" className="field tabular" />
            </label>
            <label className="field-label">{t("filters.votes")}
              <select name="votes" defaultValue={String(minVotes)} className="field">
                {Array.from({ length: people.length + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n === 0 ? t("filters.anyVotes") : t("filters.atLeast", { count: n })}</option>)}
              </select>
            </label>
            <label className="field-label">{t("filters.sort")}
              <select name="sort" defaultValue={sort} className="field">
                {RANK_SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="all" value="1" defaultChecked={filters.everyone} className="size-5 shrink-0 accent-[var(--color-accent)]" />
            {t("filters.everyoneSaw")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary">{t("filters.apply")}</button>
            {hasFilters && <Link href={`/c/${circleId}/ranking`} className="link inline-flex min-h-11 items-center text-sm">{t("filters.reset")}</Link>}
          </div>
        </form>
      </details>

      {shown.length === 0 ? (
        <p className="empty well grained p-6 text-ink-2">{facts.length === 0 ? t("emptyAll") : t("empty")}</p>
      ) : (
        // The league table: one title a row under a full-width hairline, the rank as the leading numeral.
        <ol className="stagger rows grid" start={(page - 1) * PAGE_SIZE + 1}>
          {shown.map((r, i) => {
            const n = (page - 1) * PAGE_SIZE + i + 1;
            return (
              <li key={r.mediaId} className="grid grid-cols-[3.25rem_56px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 py-4 sm:grid-cols-[4rem_56px_minmax(0,1fr)_auto] sm:gap-x-4">
                <span className={`figure min-w-10 leading-[0.86] ${n > 99 ? "text-[2.75rem]" : "text-[4.5rem]"} ${n === 1 ? "text-accent" : "text-ink"}`} aria-label={t("position", { n })}>{n}</span>
                <Poster media={{ id: r.mediaId, title: r.title, posterPath: r.posterPath }} size="sm" />
                <div className="grid min-w-0 gap-1">
                  <h2 className="title text-xl [overflow-wrap:anywhere] sm:text-2xl">{r.title}</h2>
                  <p className="text-sm text-muted">{[tk(r.kind), r.year].filter(Boolean).join(", ")}</p>
                </div>
                <div className="grid justify-items-end gap-1.5 text-right">
                  {r.avg === null ? <span className="text-sm text-muted">{t("notRated")}</span> : (
                    <>
                      <span className="figure text-[2.5rem] text-ink">{nfFixed.format(r.avg / 2)}</span>
                      <span className="meter block w-16" role="img" aria-label={t("avgLabel", { stars: nfShort.format(r.avg / 2) })}>
                        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, r.avg / 10))})` }} />
                      </span>
                      <span className="tabular text-sm text-muted">{t("votes", { count: r.votes })}</span>
                    </>
                  )}
                </div>
                <ul className="col-span-full flex flex-wrap gap-1.5 sm:col-start-3 sm:col-end-[-1]" aria-label={t("who")}>
                  {people.filter((p) => r.watchedBy.has(p.id)).map((p) => {
                    const rating = r.ratings.get(p.id);
                    return (
                      <li key={p.id} className={`tag gap-1.5 ${p.id === me.id ? "border-accent" : ""}`}>
                        <span>{first(p.name)}</span>
                        {rating === undefined
                          ? <span className="sr-only">{t("noRating")}</span>
                          : <span className="tabular font-semibold text-ink"><span className="sr-only">{t("rated", { stars: rating / 2 })}</span><span aria-hidden="true">{num(rating)}<span className="text-muted">★</span></span></span>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {all.length > PAGE_SIZE && (
        <nav aria-label={t("pages")} className="flex items-center justify-between gap-3">
          {page > 1 ? <Link href={link(page - 1)} className="btn">{t("prev")}</Link> : <span />}
          <span className="tabular text-sm text-muted">{page} / {Math.ceil(all.length / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < all.length ? <Link href={link(page + 1)} className="btn">{t("next")}</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
