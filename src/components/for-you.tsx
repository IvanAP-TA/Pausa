import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { personalPicks } from "@/lib/discover";
import { Poster } from "./poster";

/**
 * "Per te": titles like the ones I rated well, that I have not logged (TMDB recommendations, weighted by my own ratings).
 * TMDB-backed and slow: always streamed in (Suspense) after the rest of the page. `logBase` is the Cerchia to log from.
 */
/** TMDB-backed and slow: streamed in after the rest of the page. */
export async function ForYou({ userId, locale, logBase }: { userId: string; locale: string; logBase: string | null }) {
  const [mine, tf, tk, format] = await Promise.all([personalPicks(userId, locale), getTranslations("discover"), getTranslations("kind"), getFormatter()]);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  return (
    <>
          {!mine.enabled ? (
            <p className="well p-5 text-ink-2">{tf("off")}</p>
          ) : mine.picks.length === 0 ? (
            <p className="well p-5 text-ink-2">{tf("empty")}</p>
          ) : (
            <ul className="rows grid">
              {mine.picks.map((p) => (
                <li key={p.candidate.id} className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-5">
                  <Poster media={{ id: p.candidate.id, title: p.candidate.title, posterPath: p.candidate.posterPath }} size="md" />
                  <div className="grid min-w-0 content-start gap-1">
                    <p className="title text-2xl">{p.candidate.title}</p>
                    <p className="text-sm text-muted">{tk(p.candidate.kind)}{p.candidate.year ? `, ${p.candidate.year}` : ""}</p>
                    <p className="mt-2">{tf("because", { titles: list(p.because.map((b) => b.title)) })}</p>
                    {p.on.length > 0 && <p className="text-sm text-ink-2">{tf("on", { services: list(p.on.map((x) => x.name)) })}</p>}
                    {logBase && <Link href={`${logBase}/log?media=${p.candidate.id}`} className="link inline-flex min-h-11 w-fit items-center text-sm">{tf("log")}</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
    </>
  );
}
