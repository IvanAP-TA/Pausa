import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import {
  MIN_COMMON, agreements, latestRatings, loadCircleFacts, recommend, tastePairs, yearInReview, yearsWithLogs,
  type TitleVerdict,
} from "@/lib/core/insights";
import { Suspense } from "react";
import { personalPicks } from "@/lib/discover";
import { ShareYear } from "./share-year";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "insights" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Insights({ params, searchParams }: PageProps<"/[locale]/c/[circleId]/insights">) {
  const { locale, circleId } = await params;
  const { year: yearParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();

  const [{ people, facts, watching }, t, tk, tc, tf, format] = await Promise.all([
    getDb().then((db) => loadCircleFacts(db, circleId, locale)),
    getTranslations("insights"),
    getTranslations("kind"),
    getTranslations("common"),
    getTranslations("discover"),
    getFormatter(),
  ]);

  const years = yearsWithLogs(facts);
  const requested = Number(Array.isArray(yearParam) ? yearParam[0] : yearParam);
  const year = years.includes(requested) ? requested : (years[0] ?? new Date().getFullYear());
  const review = yearInReview(facts, people, year);
  const ratings = latestRatings(facts);
  const pairs = tastePairs(people, ratings);
  const { agree, split } = agreements(facts, people);
  const recs = recommend(facts, people, 6, watching);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  const stat = "grid gap-0.5 rounded-md border border-rule bg-paper-2 p-4";

  const verdictList = (items: TitleVerdict[]) => (
    <ul className="grid gap-3">
      {items.map((v) => (
        <li key={v.mediaId} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3">
          <Poster media={{ id: v.mediaId, title: v.title, posterPath: v.posterPath }} size="sm" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight">{v.title}</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {v.ratings.map((r) => (
                <li key={r.person.id} className="flex items-center gap-1">
                  {r.person.name} <Stars rating={r.rating} label={t("ratingLabel", { name: r.person.name, stars: r.rating / 2 })} className="text-xs" />
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="grid gap-10 px-4 pb-10 pt-6">
      <div className="grid gap-3">
        <Link href={`/c/${circleId}/members`} className="inline-flex min-h-10 w-fit items-center text-sm text-muted hover:text-ink">← {tc("back")}</Link>
        <h1 className="font-display text-[2rem] leading-[1.05]">{t("title")}</h1>
        {years.length > 1 && (
          <nav aria-label={t("yearLabel")} className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Link key={y} href={`/c/${circleId}/insights?year=${y}`} aria-current={y === year ? "page" : undefined}
                className={`tabular inline-flex min-h-9 items-center rounded-full border px-4 text-sm ${y === year ? "border-accent bg-accent text-on-accent" : "border-rule text-muted hover:text-ink"}`}>
                {y}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Year in Review */}
      <section className="grid gap-4" aria-labelledby="yir">
        <h2 id="yir" className="font-display text-[1.6rem] leading-tight">{t("yearTitle", { year })}</h2>
        {review.logs === 0 ? (
          <p className="text-sm text-muted">{t("yearEmpty", { year })}</p>
        ) : (
          <>
            <ShareYear circleId={circleId} year={year} />
            <div className="grid grid-cols-2 gap-3">
              <p className={stat}><span className="tabular font-display text-[2rem] leading-none">{review.logs}</span><span className="text-sm text-muted">{t("stats.logs", { count: review.logs })}</span></p>
              <p className={stat}><span className="tabular font-display text-[2rem] leading-none">{review.titles}</span><span className="text-sm text-muted">{t("stats.titles")}</span></p>
              {review.movieHours !== null && (
                <p className={stat}><span className="tabular font-display text-[2rem] leading-none">{review.movieHours}</span><span className="text-sm text-muted">{t("stats.hours")}</span></p>
              )}
              {review.avgRating !== null && (
                <p className={stat}>
                  <span className="tabular font-display text-[2rem] leading-none">{format.number(review.avgRating, { maximumFractionDigits: 1 })}</span>
                  <span className="text-sm text-muted">{t("stats.avg")}</span>
                </p>
              )}
            </div>

            {review.titleOfTheYear && (
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 rounded-md border border-rule bg-paper-2 p-4">
                <Poster media={{ id: review.titleOfTheYear.mediaId, title: review.titleOfTheYear.title, posterPath: review.titleOfTheYear.posterPath }} size="md" />
                <div className="min-w-0 self-center">
                  <p className="text-xs text-muted">{t("titleOfYear")}</p>
                  <p className="font-display text-[1.5rem] leading-tight">{review.titleOfTheYear.title}</p>
                  <Stars className="mt-1.5 text-base" rating={Math.round(review.titleOfTheYear.stars * 2)} label={t("starsLabel", { stars: review.titleOfTheYear.stars })} />
                  <p className="mt-1 text-xs text-muted">{t("raters", { count: review.titleOfTheYear.raters })}</p>
                </div>
              </div>
            )}

            <ul className="grid gap-1.5 text-sm text-muted">
              {review.mostActive?.person && <li>{t("facts.mostActive", { name: review.mostActive.person.name, count: review.mostActive.logs })}</li>}
              {review.busiestMonth && (
                <li>{t("facts.busiest", { month: format.dateTime(new Date(2000, review.busiestMonth.month - 1, 1), { month: "long" }), count: review.busiestMonth.logs })}</li>
              )}
              {review.topPlatform && <li>{t("facts.platform", { name: review.topPlatform.name })}</li>}
              {review.togetherMost && <li>{t("facts.together", { a: review.togetherMost.a.name, b: review.togetherMost.b.name, count: review.togetherMost.times })}</li>}
              <li>{list((Object.entries(review.byKind) as [keyof typeof review.byKind & string, number][]).map(([k, n]) => `${n} ${tk(k).toLowerCase()}`))}</li>
            </ul>
          </>
        )}
      </section>

      {/* Taste */}
      {people.length > 1 && (
        <section className="grid gap-3" aria-labelledby="taste">
          <div>
            <h2 id="taste" className="font-display text-[1.6rem] leading-tight">{t("taste.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("taste.body", { min: MIN_COMMON })}</p>
          </div>
          <ul className="grid gap-3">
            {pairs.map((p) => (
              <li key={`${p.a.id}-${p.b.id}`} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">{list([p.a.name, p.b.name])}</span>
                  {p.score !== null ? (
                    <span className="tabular text-muted">{format.number(p.score, { style: "percent" })} · {t("taste.onTitles", { count: p.common })}</span>
                  ) : (
                    <span className="text-xs text-muted">{t("taste.needMore", { count: p.common, min: MIN_COMMON })}</span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-rule" role="img" aria-label={p.score !== null ? format.number(p.score, { style: "percent" }) : t("taste.unknown")}>
                  {p.score !== null && <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(p.score * 100)}%` }} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(agree.length > 0 || split.length > 0) && (
        <section className="grid gap-6" aria-labelledby="agree">
          <h2 id="agree" className="sr-only">{t("agree.title")} / {t("split.title")}</h2>
          {agree.length > 0 && (
            <div className="grid gap-3">
              <h3 className="font-display text-xl leading-tight">{t("agree.title")}</h3>
              {verdictList(agree)}
            </div>
          )}
          {split.length > 0 && (
            <div className="grid gap-3">
              <h3 className="font-display text-xl leading-tight">{t("split.title")}</h3>
              {verdictList(split)}
            </div>
          )}
        </section>
      )}

      {/* For you: what to watch next, from what this person loved (TMDB) */}
      <section className="grid gap-3" aria-labelledby="foryou">
        <div>
          <h2 id="foryou" className="font-display text-[1.6rem] leading-tight">{tf("title")}</h2>
          <p className="mt-1 text-sm text-muted">{tf("body")}</p>
        </div>
        <Suspense fallback={<p role="status" className="text-sm text-muted">{tf("loading")}</p>}>
          <ForYou userId={user.id} locale={locale} circleId={circleId} />
        </Suspense>
        <p className="text-xs text-muted">{tf("credit")}</p>
      </section>

      {/* Recommendations */}
      <section className="grid gap-3" aria-labelledby="recs">
        <div>
          <h2 id="recs" className="font-display text-[1.6rem] leading-tight">{t("recs.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("recs.body")}</p>
        </div>
        {recs.length === 0 ? (
          <p className="text-sm text-muted">{t("recs.empty")}</p>
        ) : (
          <ul className="grid gap-4">
            {recs.map((r) => (
              <li key={r.mediaId} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                <Poster media={{ id: r.mediaId, title: r.title, posterPath: r.posterPath }} size="sm" />
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight">{r.title}</p>
                  <p className="text-xs text-muted">{tk(r.kind)}{r.year ? ` · ${r.year}` : ""}</p>
                  <p className="mt-1 text-sm">{t("recs.lovedBy", { names: list(r.lovedBy.map((l) => l.person.name)) })}</p>
                  <p className="text-sm text-muted">{t("recs.unseenBy", { names: list(r.unseenBy.map((p) => p.name)) })}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    {t("recs.forecast")}
                    <Stars rating={Math.round(r.score)} label={t("starsLabel", { stars: r.score / 2 })} className="text-xs" />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** TMDB-backed and slow: streamed in after the rest of the page. */
async function ForYou({ userId, locale, circleId }: { userId: string; locale: string; circleId: string }) {
  const [mine, tf, tk, format] = await Promise.all([personalPicks(userId, locale), getTranslations("discover"), getTranslations("kind"), getFormatter()]);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  return (
    <>
          {!mine.enabled ? (
            <p className="text-sm text-muted">{tf("off")}</p>
          ) : mine.picks.length === 0 ? (
            <p className="text-sm text-muted">{tf("empty")}</p>
          ) : (
            <ul className="grid gap-4">
              {mine.picks.map((p) => (
                <li key={p.candidate.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                  <Poster media={{ id: p.candidate.id, title: p.candidate.title, posterPath: p.candidate.posterPath }} size="sm" />
                  <div className="min-w-0">
                    <p className="font-display text-lg leading-tight">{p.candidate.title}</p>
                    <p className="text-xs text-muted">{tk(p.candidate.kind)}{p.candidate.year ? ` · ${p.candidate.year}` : ""}</p>
                    <p className="mt-1 text-sm">{tf("because", { titles: list(p.because.map((b) => b.title)) })}</p>
                    {p.on.length > 0 && <p className="text-xs text-second-text">{tf("on", { services: list(p.on.map((x) => x.name)) })}</p>}
                    <Link href={`/c/${circleId}/log?media=${p.candidate.id}`} className="mt-1 inline-flex min-h-10 items-center text-xs text-muted underline underline-offset-4 hover:text-ink">{tf("log")}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
    </>
  );
}
