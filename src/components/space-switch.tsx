import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Avatar } from "./avatar";
import { PauseMark } from "./brand";
import { SpaceMenu } from "./space-menu";

type Circle = { id: string; name: string };
type Me = { id: string; name: string; image?: string | null };

/**
 * The one bar at the top of every signed-in page (it stays in sight while the page scrolls):
 * the mark, then the place I am in as a button that switches to any other place (my own space, each Cerchia), then
 * the bell of this Cerchia and my avatar (the way to Account). On a wide screen the rail carries the mark and the avatar.
 * It is the page's banner landmark.
 */
export async function SpaceSwitch({ current, circle, circles = [], me, unread = 0 }: { current: "personal" | "circle"; circle: Circle | null; circles?: Circle[]; me: Me; unread?: number }) {
  const [t, tf, ta] = await Promise.all([getTranslations("space"), getTranslations("feed"), getTranslations("account")]);
  const inCircle = current === "circle" && circle;
  const home = inCircle ? `/c/${circle.id}` : "/me";
  return (
    <header className="sticky top-0 z-[250] flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center gap-1 border-b border-rule bg-paper pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.25rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)]">
      <Link href={home} aria-label="Pausa" className="grid size-11 shrink-0 place-items-center lg:hidden">
        <PauseMark className="h-6" />
      </Link>
      <nav aria-label={t("switch")} className="min-w-0 flex-1">
        <SpaceMenu
          circles={circles.map((c) => ({ id: c.id, name: c.name }))}
          currentId={inCircle ? circle.id : null}
          currentName={inCircle ? circle.name : t("personal")}
          labels={{ open: t("switchOpen"), title: t("switchTitle"), personal: t("personal"), here: t("here"), more: t("moreCircles") }}
        />
      </nav>
      {inCircle && (
        <Link
          href={`/c/${circle.id}/notifications`}
          aria-label={unread ? tf("unread", { count: unread }) : tf("notifications")}
          className="relative grid size-11 shrink-0 place-items-center text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink"
        >
          <Bell size={22} strokeWidth={1.6} aria-hidden="true" />
          {unread > 0 && (
            <span aria-hidden="true" className="tabular absolute right-0.5 top-0.5 grid min-w-5 place-items-center bg-accent px-1 text-xs font-semibold leading-5 text-accent-ink">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      )}
      <Link href="/account" aria-label={ta("profile")} className="grid size-11 shrink-0 place-items-center transition-colors duration-150 hover:bg-paper-2 lg:hidden">
        <Avatar user={me} size={30} />
      </Link>
    </header>
  );
}
