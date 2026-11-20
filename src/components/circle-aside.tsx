"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Poster } from "./poster";
import { Stars } from "./stars";

type Pick = { id: string; title: string; posterPath: string | null; kind: "movie" | "tv" | "anime"; year: number | null; score: number };
type Top = { id: string; title: string; posterPath: string | null; avg: number | null; votes: number };

const WIDE = "(min-width: 80rem)";

/**
 * The second column of a Cerchia on wide screens (80rem and up): "Da vedere insieme" from the recommendation engine, and
 * the top five of the ranking. It asks for its data only when the screen is that wide (a phone never downloads or computes
 * it), once per Cerchia, and keeps its place while it loads so the page does not jump.
 */
export function CircleAside({ circleId }: { circleId: string }) {
  const t = useTranslations("aside");
  const ti = useTranslations("insights");
  const tk = useTranslations("kind");
  const locale = useLocale();
  const pathname = usePathname();
  const [data, setData] = useState<{ id: string; recs: Pick[]; top: Top[] } | null>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!wide || data?.id === circleId) return;
    let live = true;
    fetch(`/api/circle/${circleId}/aside?locale=${locale}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ recs?: Pick[]; top?: Top[] }>) : null))
      .then((d: { recs?: Pick[]; top?: Top[] } | null) => { if (live && d) setData({ id: circleId, recs: d.recs ?? [], top: d.top ?? [] }); })
      .catch(() => {});
    return () => { live = false; };
  }, [wide, circleId, locale, data?.id]);

  const shown = data?.id === circleId ? data : null;
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <aside aria-label={t("label")} className="hidden xl:order-3 xl:block xl:w-72 xl:shrink-0">
      <div className="sticky top-0 grid max-h-dvh gap-8 overflow-y-auto overscroll-contain pb-8 pt-8 [scrollbar-width:thin]">
        <section aria-labelledby="aside-recs" className="grid gap-3">
          <h2 id="aside-recs" className="title text-xl">{ti("recs.title")}</h2>
          {!shown ? <div className="skeleton h-44" aria-hidden="true" /> : shown.recs.length === 0 ? (
            <p className="text-sm text-muted">{ti("recs.empty")}</p>
          ) : (
            <ul className="rows grid">
              {shown.recs.map((r) => (
                <li key={r.id}>
                  <Link href={`/c/${circleId}/m/${r.id}`} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 py-2.5 transition-colors duration-150 hover:bg-paper-2">
                    <Poster media={r} size="sm" />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-semibold">{r.title}</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        {tk(r.kind)}{r.year ? `, ${r.year}` : ""}
                        <Stars rating={Math.round(r.score)} label={ti("starsLabel", { stars: r.score / 2 })} className="text-xs" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/c/${circleId}/insights`} className="link w-fit text-sm">{t("why")}</Link>
        </section>

        <section aria-labelledby="aside-top" className="grid gap-3">
          <h2 id="aside-top" className="title text-xl">{t("top")}</h2>
          {!shown ? <div className="skeleton h-44" aria-hidden="true" /> : shown.top.length === 0 ? (
            <p className="text-sm text-muted">{t("topEmpty")}</p>
          ) : (
            <ol className="rows grid">
              {shown.top.map((r, i) => (
                <li key={r.id}>
                  <Link href={`/c/${circleId}/m/${r.id}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 transition-colors duration-150 hover:bg-paper-2">
                    <span className="figure text-center text-lg text-muted">{i + 1}</span>
                    <span className="truncate">{r.title}</span>
                    <span className="tabular text-sm text-ink">{r.avg === null ? "-" : fmt.format(r.avg / 2)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {!pathname.endsWith("/ranking") && <Link href={`/c/${circleId}/ranking`} className="link w-fit text-sm">{t("allRanking")}</Link>}
        </section>
      </div>
    </aside>
  );
}
