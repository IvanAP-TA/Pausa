import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getLogInCircle, getMembers } from "@/lib/data";
import { Poster } from "@/components/poster";
import { EditLogForm } from "./edit-form";

export default async function EditLog({ params }: PageProps<"/[locale]/c/[circleId]/l/[logId]/edit">) {
  const { locale, circleId, logId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const log = await getLogInCircle(circleId, logId, user.id, locale);
  // Only the author edits; for everyone else the page does not exist.
  if (!log || log.author.id !== user.id) notFound();
  const [members, t, tc] = await Promise.all([getMembers(circleId), getTranslations("manage"), getTranslations("common")]);

  return (
    <main className="grid gap-6 px-4 pb-8 pt-6">
      <Link href={`/c/${circleId}/l/${logId}`} className="inline-flex min-h-10 w-fit items-center text-sm text-muted hover:text-ink">← {tc("back")}</Link>
      <h1 className="font-display text-[1.75rem] leading-tight">{t("editLog")}</h1>
      <div className="flex items-center gap-3 rounded-md bg-paper-2 p-3">
        <Poster media={log.media} size="sm" className="w-12 shrink-0" />
        <p className="font-display text-lg leading-tight">{log.media.title}</p>
      </div>
      <EditLogForm
        showSeason={log.media.kind !== "movie"}
        logId={logId}
        circleId={circleId}
        today={new Date().toISOString().slice(0, 10)}
        initial={{ season: log.season, watchedOn: log.watchedOn, rating: log.rating, review: log.review, platform: log.platform, containsSpoilers: log.containsSpoilers }}
        members={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }))}
        initialWith={log.watchedWith.map((w) => w.id)}
      />
    </main>
  );
}
