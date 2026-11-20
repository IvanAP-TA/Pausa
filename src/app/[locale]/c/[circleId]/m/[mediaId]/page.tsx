import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleFeed, getListTargets, getMediaPage } from "@/lib/data";
import { addToList } from "@/lib/actions";
import { ensureMediaDetail } from "@/lib/media-detail";
import { LogCard } from "@/components/log-card";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";
import { SubmitButton } from "@/components/submit-button";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { BackLink } from "@/components/back-link";

export async function generateMetadata({ params }: PageProps<"/[locale]/c/[circleId]/m/[mediaId]">) {
  const { locale, mediaId } = await params;
  const media = await getMediaPage(mediaId, locale);
  return { title: media?.title, robots: { index: false } };
}

/**
 * A title, seen from a Cerchia: what it is about (synopsis, genres, leading cast), then what the Cerchia made of it.
 * Not a catalogue page: just enough to place the film, and the group's own word on it.
 */
export default async function MediaPage({ params }: PageProps<"/[locale]/c/[circleId]/m/[mediaId]">) {
  const { locale, circleId, mediaId } = await params;
  setRequestLocale(locale);
  const user = await requireUser(); // membership of the Cerchia is checked by the layout
  const media = await getMediaPage(mediaId, locale);
  if (!media) notFound();

  const [detail, logs, targets, t, tk, tc, tl, tf] = await Promise.all([
    ensureMediaDetail(mediaId, locale),
    getCircleFeed(circleId, user.id, locale, 30, undefined, undefined, { mediaId }),
    getListTargets(circleId, user.id),
    getTranslations("media"), getTranslations("kind"), getTranslations("common"), getTranslations("lists"), getTranslations("feed"),
  ]);
  const now = new Date();
  const rated = logs.filter((l) => l.rating);
  const avg = rated.length ? Math.round(rated.reduce((n, l) => n + l.rating!, 0) / rated.length) : null;
  const hours = media.runtimeMin ? Math.floor(media.runtimeMin / 60) : 0;
  const facts = [
    tk(media.kind),
    media.year ? String(media.year) : null,
    media.runtimeMin ? (hours ? t("runtimeLong", { h: hours, m: media.runtimeMin % 60 }) : t("runtime", { m: media.runtimeMin })) : null,
  ].filter(Boolean);

  return (
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <BackLink href={`/c/${circleId}`} label={tc("back")} />

      <header className="grid grid-cols-[128px_minmax(0,1fr)] gap-x-4 gap-y-5 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-x-6">
        <Poster media={media} size="lg" priority />
        <div className="grid min-w-0 content-start gap-2">
          <h1 className="display [overflow-wrap:anywhere]">{media.title}</h1>
          {media.originalTitle !== media.title && <p className="text-ink-2">{media.originalTitle}</p>}
          <p className="text-sm text-muted">{facts.join(", ")}</p>
          {detail.genres.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {detail.genres.map((g) => <li key={g} className="tag">{g}</li>)}
            </ul>
          )}
          {avg ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars rating={avg} label={tf("rating", { stars: avg / 2 })} />
              <span className="text-sm text-muted">{t("circleAverage", { count: rated.length })}</span>
            </p>
          ) : null}
        </div>
        <div className="col-span-full flex flex-wrap gap-2">
          <Link href={`/c/${circleId}/log?media=${media.id}`} className="btn btn-primary">
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
            {t("logIt")}
          </Link>
        </div>
      </header>

      <section className="grid gap-3" aria-labelledby="about-title">
        <h2 id="about-title" className="chapter">{t("about")}</h2>
        {detail.overview ? (
          <p className="max-w-prose whitespace-pre-line text-ink-2">{detail.overview}</p>
        ) : (
          <p className="text-muted">{t("noOverview")}</p>
        )}
        {detail.source === "user" && <p className="text-sm text-muted">{t("byMember")}</p>}
      </section>

      {detail.cast.length > 0 && (
        <section className="grid gap-3" aria-labelledby="cast-title">
          <h2 id="cast-title" className="chapter">{t("cast")}</h2>
          <ul className="rows grid sm:grid-cols-2 sm:gap-x-6">
            {detail.cast.map((c) => (
              <li key={c.name + (c.role ?? "")} className="grid gap-0.5 py-3">
                <span className="font-semibold">{c.name}</span>
                {c.role && <span className="text-sm text-muted">{c.role}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {targets.length > 0 && (
        <form action={addToList} className="flex gap-2">
          <input type="hidden" name="mediaId" value={media.id} />
          <label htmlFor="listId" className="sr-only">{tl("addTo")}</label>
          <select id="listId" name="listId" required defaultValue="" className="field min-w-0 flex-1">
            <option value="" disabled>{tl("addTo")}</option>
            {targets.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.personal ? ` (${tl("personal")})` : ""}</option>
            ))}
          </select>
          <SubmitButton className="btn shrink-0">{tl("add")}</SubmitButton>
        </form>
      )}

      <section className="grid gap-2" aria-labelledby="seen-title">
        <h2 id="seen-title" className="chapter">{t("inCircle")}</h2>
        {logs.length === 0 ? (
          <p className="text-ink-2">{t("nobodyYet")}</p>
        ) : (
          <div className="grid">
            {logs.map((log) => <LogCard key={log.id} log={log} now={now} circleId={circleId} />)}
          </div>
        )}
      </section>

      {detail.source === "tmdb" && <TmdbAttribution />}
    </main>
  );
}
