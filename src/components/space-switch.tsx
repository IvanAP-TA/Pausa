import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PauseMark } from "./brand";
import { SpaceMenu } from "./space-menu";

type Circle = { id: string; name: string };

/**
 * The one bar at the top of every signed-in page (it stays in sight while the page scrolls): the mark, then the Cerchia
 * I am in as a button that switches to any other one (or to joining a new one), then the bell of this Cerchia.
 * My profile is the last tab of the bar at the bottom. It is the page's banner landmark.
 */
export async function SpaceSwitch({ circle, circles = [], unread = 0 }: { circle: Circle | null; circles?: Circle[]; unread?: number }) {
  const [t, tf] = await Promise.all([getTranslations("space"), getTranslations("feed")]);
  return (
    <header className="sticky top-0 z-[250] flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] items-center gap-1 border-b border-rule bg-paper pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.25rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)]">
      <Link href={circle ? `/c/${circle.id}` : "/me/circles"} aria-label="Pausa" className="grid size-11 shrink-0 place-items-center lg:hidden">
        <PauseMark className="h-6" />
      </Link>
      <nav aria-label={t("switch")} className="min-w-0 flex-1">
        <SpaceMenu
          circles={circles.map((c) => ({ id: c.id, name: c.name }))}
          currentId={circle?.id ?? null}
          currentName={circle ? circle.name : t("circles")}
          labels={{ open: t("switchOpen"), title: t("switchTitle"), here: t("here"), more: t("moreCircles") }}
        />
      </nav>
      {circle && (
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
    </header>
  );
}
