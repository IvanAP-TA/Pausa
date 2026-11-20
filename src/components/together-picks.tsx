import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { loadCircleFacts } from "@/lib/core/insights";
import { recommendFast } from "@/lib/engine";
import { Poster } from "./poster";
import { Stars } from "./stars";

/**
 * "Da vedere insieme": the recommendation engine (Rust, compiled to WebAssembly) on this Cerchia. Titles someone loved
 * that the others have not seen, each predicted from the ratings of the people whose taste matches theirs.
 * It reads the whole Cerchia, so it is always streamed in (Suspense) after the page. `compact` is the side-column form.
 */
export async function TogetherPicks({ circleId, locale, limit = 4, compact = false }: { circleId: string; locale: string; limit?: number; compact?: boolean }) {
  const [{ people, facts, watching }, t, tk, format] = await Promise.all([
    getDb().then((db) => loadCircleFacts(db, circleId, locale)),
    getTranslations("insights"), getTranslations("kind"), getFormatter(),
  ]);
  const recs = await recommendFast(facts, people, limit, watching);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });

  if (recs.length === 0) return <p className="text-sm text-muted">{t("recs.empty")}</p>;
  return (
    <ul className="rows grid">
      {recs.map((r) => (
        <li key={r.mediaId}>
          <Link href={`/c/${circleId}/m/${r.mediaId}`} className={`grid gap-3 transition-colors duration-150 hover:bg-paper-2 ${compact ? "grid-cols-[48px_minmax(0,1fr)] py-3" : "grid-cols-[72px_minmax(0,1fr)] py-4"}`}>
            <Poster media={{ id: r.mediaId, title: r.title, posterPath: r.posterPath }} size="sm" />
            <span className="grid min-w-0 content-start gap-1">
              <span className={`title [overflow-wrap:anywhere] ${compact ? "text-lg" : "text-xl"}`}>{r.title}</span>
              <span className="text-sm text-muted">{tk(r.kind)}{r.year ? `, ${r.year}` : ""}</span>
              {!compact && <span className="text-sm text-ink-2">{t("recs.lovedBy", { names: list(r.lovedBy.map((l) => l.person.name)) })}</span>}
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                {t("recs.forecast")}
                <Stars rating={Math.round(r.score)} label={t("starsLabel", { stars: r.score / 2 })} className="text-sm" />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
