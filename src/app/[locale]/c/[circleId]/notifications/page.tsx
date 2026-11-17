import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getNotifications } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { MarkRead } from "./mark-read";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notifications" });
  return { title: t("title"), robots: { index: false } };
}

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
      <Link href={`/c/${circleId}`} className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>
      <h1 className="display">{t("title")}</h1>

      {items.length === 0 ? (
        <p className="well grained p-6 text-ink-2">{t("empty")}</p>
      ) : (
        <ul className="rows grid">
          {items.map((n) => {
            const text = t.rich(n.type, {
              name: n.actor?.name ?? "",
              title: n.mediaTitle ?? "",
              circle: n.circleName ?? "",
              b: (chunks) => <strong>{chunks}</strong>,
            });
            // Log-related notices open the thread when it's in this Cerchia's feed; others open the feed.
            const href = n.logId ? `/c/${n.circleId ?? circleId}/l/${n.logId}` : `/c/${n.circleId ?? circleId}`;
            return (
              <li key={n.id}>
                {/* Unread: an amber square and ink text. Read: muted text, the square's column left empty so rows stay aligned. */}
                <Link href={href} className="grid min-h-14 grid-cols-[8px_32px_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors duration-150 hover:bg-paper-2">
                  {!n.readAt ? <span aria-hidden="true" className="size-2 bg-accent" /> : <span />}
                  {n.actor ? <Avatar user={n.actor} size={32} /> : <span className="size-8" />}
                  <span className={`min-w-0 [overflow-wrap:anywhere] ${n.readAt ? "text-muted" : "text-ink"}`}>{text}</span>
                  <time className="tabular text-sm text-muted" dateTime={n.createdAt.toISOString()}>
                    {format.relativeTime(n.createdAt, now)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
