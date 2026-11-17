import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { loadCircleFacts } from "@/lib/core/insights";
import { PAGE_SIZE, RANK_SORTS, rankTitles, yearSpan, type RankFilters, type RankSort } from "@/lib/core/ranking";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";

const field = "min-h-11 min-w-0 rounded-sm border border-rule bg-paper px-2 text-sm text-ink";

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

  const [{ people, facts }, t, tk, format] = await Promise.all([
    getDb().then((db) => loadCircleFacts(db, circleId, locale)),
    getTranslations("ranking"), getTranslations("kind"), getFormatter(),
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
  const num = (r: number) => format.number(r / 2, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const first = (name: string) => name.split(/\s+/)[0] ?? name;

  return (
    <main className="grid gap-5 px-4 pb-10 pt-6">
      <header className="grid gap-1">
        <h1 className="font-display text-[1.9rem] leading-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("lede")}</p>
      </header>

      <details open={hasFilters} className="rounded-md border border-rule bg-paper-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold marker:content-none">
          <span>{t("filters.title")}</span>
          <span className="rounded-full bg-paper-3 px-2 py-0.5 text-xs tabular">{t("count", { count: all.length })}</span>
        </summary>
        <form method="get" role="search" className="grid gap-3 border-t border-rule p-4">
          <label className="grid gap-1 text-xs text-muted">{t("filters.q")}
            <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={80} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-muted">{t("filters.kind")}
              <select name="kind" defaultValue={kind ?? ""} className={field}>
                <option value="">{t("filters.any")}</option>
                {(["movie", "tv", "anime"] as const).map((k) => <option key={k} value={k}>{tk(k)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">{t("filters.by")}
              <select name="by" defaultValue={by ?? ""} className={field}>
                <option value="">{t("filters.everyone")}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">{t("filters.from")}
              <input type="number" name="from" min={span?.min ?? 1870} max={span?.max ?? 2200} placeholder={span ? String(span.min) : ""} defaultValue={filters.yearFrom ?? ""} inputMode="numeric" className={field} />
            </label>
            <label className="grid gap-1 text-xs text-muted">{t("filters.to")}
              <input type="number" name="to" min={span?.min ?? 1870} max={span?.max ?? 2200} placeholder={span ? String(span.max) : ""} defaultValue={filters.yearTo ?? ""} inputMode="numeric" className={field} />
            </label>
            <label className="grid gap-1 text-xs text-muted">{t("filters.votes")}
              <select name="votes" defaultValue={String(minVotes)} className={field}>
                {Array.from({ length: people.length + 1 }, (_, i) => i).map((n) => <option key={n} value={n}>{n === 0 ? t("filters.anyVotes") : t("filters.atLeast", { count: n })}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted">{t("filters.sort")}
              <select name="sort" defaultValue={sort} className={field}>
                {RANK_SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <input type="checkbox" name="all" value="1" defaultChecked={filters.everyone} className="size-5 accent-[var(--color-accent)]" />
            {t("filters.everyoneSaw")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover">{t("filters.apply")}</button>
            {hasFilters && <Link href={`/c/${circleId}/ranking`} className="inline-flex min-h-11 items-center px-2 text-sm text-muted underline underline-offset-4 hover:text-ink">{t("filters.reset")}</Link>}
          </div>
        </form>
      </details>

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule p-6 text-center text-sm text-muted">{facts.length === 0 ? t("emptyAll") : t("empty")}</p>
      ) : (
        <ol className="grid gap-3" start={(page - 1) * PAGE_SIZE + 1}>
          {shown.map((r, i) => (
            <li key={r.mediaId} className="grid grid-cols-[1.75rem_48px_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-rule bg-paper-2 p-3">
              <span className="tabular pt-1 text-center font-display text-lg text-muted" aria-label={t("position", { n: (page - 1) * PAGE_SIZE + i + 1 })}>{(page - 1) * PAGE_SIZE + i + 1}</span>
              <Poster media={{ id: r.mediaId, title: r.title, posterPath: r.posterPath }} size="sm" />
              <div className="min-w-0">
                <h2 className="font-display text-lg leading-tight [overflow-wrap:anywhere]">{r.title}</h2>
                <p className="text-xs text-muted">{[tk(r.kind), r.year].filter(Boolean).join(" · ")}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("who")}>
                  {people.filter((p) => r.watchedBy.has(p.id)).map((p) => {
                    const rating = r.ratings.get(p.id);
                    return (
                      <li key={p.id} className={`rounded-full border px-2 py-0.5 text-xs ${p.id === me.id ? "border-accent" : "border-rule"}`}>
                        <span className="text-muted">{first(p.name)}</span>{" "}
                        {rating === undefined
                          ? <span className="text-muted"><span aria-hidden="true">·</span><span className="sr-only">{t("noRating")}</span></span>
                          : <span className="tabular font-semibold"><span className="sr-only">{t("rated", { stars: rating / 2 })}</span><span aria-hidden="true">{num(rating)}★</span></span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="grid justify-items-end gap-1 text-right">
                {r.avg === null ? <span className="text-xs text-muted">{t("notRated")}</span> : (
                  <>
                    <span className="tabular font-display text-2xl leading-none">{format.number(r.avg / 2, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    <Stars rating={r.avg} label={t("avgLabel", { stars: format.number(r.avg / 2, { maximumFractionDigits: 1 }) })} className="text-[11px]" />
                    <span className="text-xs text-muted">{t("votes", { count: r.votes })}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {all.length > PAGE_SIZE && (
        <nav aria-label={t("pages")} className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="inline-flex min-h-11 items-center rounded-full border border-rule px-5 font-semibold hover:bg-paper-2">← {t("prev")}</Link> : <span />}
          <span className="tabular text-muted">{page} / {Math.ceil(all.length / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < all.length ? <Link href={link(page + 1)} className="inline-flex min-h-11 items-center rounded-full border border-rule px-5 font-semibold hover:bg-paper-2">{t("next")} →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
