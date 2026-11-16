import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getNotifications } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { MarkRead } from "./mark-read";

export default async function Notifications({ params }: PageProps<"/[locale]/c/[circleId]/notifications">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [items, t, tc, format] = await Promise.all([
    getNotifications(user.id, locale),
    getTranslations("notifications"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const now = new Date();
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <main className="grid gap-6 px-4 pb-8 pt-6">
      {hasUnread && <MarkRead />}
      <Link href={`/c/${circleId}`} className="inline-flex min-h-8 w-fit items-center text-sm text-muted hover:text-ink">← {tc("back")}</Link>
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{t("title")}</h1>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid">
          {items.map((n) => {
            const text = t.rich(n.type, {
              name: n.actor?.name ?? "—",
              title: n.mediaTitle ?? "",
              circle: n.circleName ?? "",
              b: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
            });
            // Log-related notices open the thread when it's in this Cerchia's feed; others open the feed.
            const href = n.logId ? `/c/${n.circleId ?? circleId}/l/${n.logId}` : `/c/${n.circleId ?? circleId}`;
            return (
              <li key={n.id}>
                <Link href={href} className="flex min-h-14 items-center gap-3 border-b border-rule py-3 hover:bg-paper-2">
                  {n.actor ? <Avatar user={n.actor} size={32} /> : <span className="size-8" />}
                  <span className="min-w-0 flex-1 text-sm text-muted">{text}</span>
                  <time className="tabular shrink-0 text-xs text-muted" dateTime={n.createdAt.toISOString()}>
                    {format.relativeTime(n.createdAt, now)}
                  </time>
                  {!n.readAt && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
