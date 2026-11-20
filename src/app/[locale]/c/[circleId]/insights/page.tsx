import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import {
  MIN_COMMON, agreements, loadCircleFacts, yearInReview, yearsWithLogs,
  type TitleVerdict,
} from "@/lib/core/insights";
import { Suspense } from "react";
import { recommendFast, tastePairsFast } from "@/lib/engine";
import { ShareYear } from "./share-year";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";
import { BackLink } from "@/components/back-link";
import { ForYou } from "@/components/for-you";


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
  const pairs = await tastePairsFast(facts, people);
  const { agree, split } = agreements(facts, people);
  const recs = await recommendFast(facts, people, 6, watching);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  // One figure of the year: the number very large, its label beneath; parted from its neighbour by a vertical hairline on wide screens.
  const stat = "grid min-w-0 content-start gap-1 sm:border-l sm:border-rule sm:pl-5 sm:first:border-l-0 sm:first:pl-0";
  const figure = "figure text-[4rem] text-ink sm:text-[5rem]";

  const verdictList = (items: TitleVerdict[]) => (
    <ul className="rows grid">
      {items.map((v) => (
        <li key={v.mediaId} className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 py-4">
          <Poster media={{ id: v.mediaId, title: v.title, posterPath: v.posterPath }} size="sm" />
          <div className="grid min-w-0 content-start gap-2">
            <p className="title text-xl">{v.title}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
              {v.ratings.map((r) => (
                <li key={r.person.id} className="flex items-center gap-1.5">
                  {r.person.name} <Stars rating={r.rating} label={t("ratingLabel", { name: r.person.name, stars: r.rating / 2 })} className="text-sm" />
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="grid gap-12 px-4 pb-10 pt-4">
      <div className="grid gap-4">
        <BackLink href={`/c/${circleId}/members`} label={tc("back")} />
        <h1 className="display">{t("title")}</h1>
        {years.length > 1 && (
          <nav aria-label={t("yearLabel")} className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Link key={y} href={`/c/${circleId}/insights?year=${y}`} aria-current={y === year ? "page" : undefined}
                className={`tabular inline-flex min-h-11 items-center border px-4 transition-colors duration-150 ${y === year ? "border-accent bg-accent font-semibold text-accent-ink" : "border-rule text-ink-2 hover:border-muted hover:text-ink"}`}>
                {y}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Year in Review */}
      <section className="grid gap-6" aria-labelledby="yir">
        <h2 id="yir" className="chapter">{t("yearTitle", { year })}</h2>
        {review.logs === 0 ? (
          <p className="empty well grained p-6 text-ink-2">{t("yearEmpty", { year })}</p>
        ) : (
          <>
            <div className="well grained grid grid-cols-2 gap-x-5 gap-y-8 p-5 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none sm:p-6">
              <p className={stat}><span className={figure}>{review.logs}</span><span className="text-sm text-muted">{t("stats.logs", { count: review.logs })}</span></p>
              <p className={stat}><span className={figure}>{review.titles}</span><span className="text-sm text-muted">{t("stats.titles")}</span></p>
              {review.movieHours !== null && (
                <p className={stat}><span className={figure}>{review.movieHours}</span><span className="text-sm text-muted">{t("stats.hours")}</span></p>
              )}
              {review.avgRating !== null && (
                <p className={stat}>
                  <span className={figure}>{format.number(review.avgRating, { maximumFractionDigits: 1 })}</span>
                  <span className="text-sm text-muted">{t("stats.avg")}</span>
                </p>
              )}
            </div>

            <ShareYear circleId={circleId} year={year} />

            {review.titleOfTheYear && (
              <div className="plate grid grid-cols-[104px_minmax(0,1fr)] gap-4 pt-5 sm:grid-cols-[128px_minmax(0,1fr)]">
                <Poster media={{ id: review.titleOfTheYear.mediaId, title: review.titleOfTheYear.title, posterPath: review.titleOfTheYear.posterPath }} size="md" />
                <div className="grid min-w-0 content-start gap-2">
                  <p className="title">{review.titleOfTheYear.title}</p>
                  <p className="text-sm text-muted">{t("titleOfYear")}</p>
                  <Stars className="mt-1" rating={Math.round(review.titleOfTheYear.stars * 2)} label={t("starsLabel", { stars: review.titleOfTheYear.stars })} />
                  <p className="text-sm text-muted">{t("raters", { count: review.titleOfTheYear.raters })}</p>
                </div>
              </div>
            )}

            <ul className="rows grid text-ink-2">
              {review.mostActive?.person && <li className="py-3">{t("facts.mostActive", { name: review.mostActive.person.name, count: review.mostActive.logs })}</li>}
              {review.busiestMonth && (
                <li className="py-3">{t("facts.busiest", { month: format.dateTime(new Date(2000, review.busiestMonth.month - 1, 1), { month: "long" }), count: review.busiestMonth.logs })}</li>
              )}
              {review.topPlatform && <li className="py-3">{t("facts.platform", { name: review.topPlatform.name })}</li>}
              {review.togetherMost && <li className="py-3">{t("facts.together", { a: review.togetherMost.a.name, b: review.togetherMost.b.name, count: review.togetherMost.times })}</li>}
              <li className="py-3">{list((Object.entries(review.byKind) as [keyof typeof review.byKind & string, number][]).map(([k, n]) => `${n} ${tk(k).toLowerCase()}`))}</li>
            </ul>
          </>
        )}
      </section>

      {/* Taste */}
      {people.length > 1 && (
        <section className="grid gap-4" aria-labelledby="taste">
          <div className="grid gap-2">
            <h2 id="taste" className="chapter">{t("taste.title")}</h2>
            <p className="max-w-prose text-ink-2">{t("taste.body", { min: MIN_COMMON })}</p>
          </div>
          <ul className="stagger rows grid">
            {pairs.map((p) => (
              <li key={`${p.a.id}-${p.b.id}`} className="grid gap-3 py-4">
                <div className="flex items-end justify-between gap-4">
                  <span className="grid min-w-0 gap-1">
                    <span className="title text-xl sm:text-2xl">{list([p.a.name, p.b.name])}</span>
                    <span className="text-sm text-muted">
                      {p.score !== null ? t("taste.onTitles", { count: p.common }) : t("taste.needMore", { count: p.common, min: MIN_COMMON })}
                    </span>
                  </span>
                  {p.score !== null && <span className="figure shrink-0 text-[2.5rem] text-ink">{format.number(p.score, { style: "percent" })}</span>}
                </div>
                <div className="meter" role="img" aria-label={p.score !== null ? format.number(p.score, { style: "percent" }) : t("taste.unknown")}>
                  {p.score !== null && <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, p.score))})` }} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(agree.length > 0 || split.length > 0) && (
        <section className="grid gap-8" aria-labelledby="agree">
          <h2 id="agree" className="sr-only">{t("agree.title")} / {t("split.title")}</h2>
          {agree.length > 0 && (
            <div className="grid gap-3">
              <h3 className="title">{t("agree.title")}</h3>
              {verdictList(agree)}
            </div>
          )}
          {split.length > 0 && (
            <div className="grid gap-3">
              <h3 className="title">{t("split.title")}</h3>
              {verdictList(split)}
            </div>
          )}
        </section>
      )}

      {/* For you: what to watch next, from what this person loved (TMDB) */}
      <section className="grid gap-4" aria-labelledby="foryou">
        <div className="grid gap-2">
          <h2 id="foryou" className="chapter">{tf("title")}</h2>
          <p className="max-w-prose text-ink-2">{tf("body")}</p>
        </div>
        <Suspense fallback={<p role="status" className="plate pt-4 text-sm text-muted">{tf("loading")}</p>}>
          <ForYou userId={user.id} locale={locale} logBase={`/c/${circleId}`} />
        </Suspense>
        <p className="text-sm text-muted">{tf("credit")}</p>
      </section>

      {/* Recommendations */}
      <section className="grid gap-4" aria-labelledby="recs">
        <div className="grid gap-2">
          <h2 id="recs" className="chapter">{t("recs.title")}</h2>
          <p className="max-w-prose text-ink-2">{t("recs.body")}</p>
        </div>
        {recs.length === 0 ? (
          <p className="well p-5 text-ink-2">{t("recs.empty")}</p>
        ) : (
          <ul className="rows grid">
            {recs.map((r) => (
              <li key={r.mediaId} className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-5">
                <Poster media={{ id: r.mediaId, title: r.title, posterPath: r.posterPath }} size="md" />
                <div className="grid min-w-0 content-start gap-1">
                  <p className="title text-2xl">{r.title}</p>
                  <p className="text-sm text-muted">{tk(r.kind)}{r.year ? `, ${r.year}` : ""}</p>
                  <p className="mt-2">{t("recs.lovedBy", { names: list(r.lovedBy.map((l) => l.person.name)) })}</p>
                  <p className="text-sm text-ink-2">{t("recs.unseenBy", { names: list(r.unseenBy.map((p) => p.name)) })}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {t("recs.forecast")}
                    <Stars rating={Math.round(r.score)} label={t("starsLabel", { stars: r.score / 2 })} className="text-base" />
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
