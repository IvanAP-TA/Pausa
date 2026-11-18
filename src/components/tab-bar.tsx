"use client";

import { BookOpen, List, Plus, Popcorn, Trophy, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Avatar } from "./avatar";
import { Wordmark } from "./brand";
import { LogoutButton } from "./logout-button";

const icons: Record<"diary" | "serata" | "lists" | "ranking" | "circle", LucideIcon> = {
  diary: BookOpen,
  serata: Popcorn,
  lists: List,
  ranking: Trophy,
  circle: Users,
};

/**
 * The navigation of the shell: a solid bar under the thumb on phones, a rail on the left from 64rem.
 * On phones the bar is three tracks, `1fr auto 1fr`: the + sits in the middle one, so it is on the centre line of the
 * screen whatever the number of tabs on each side: two and two, so the bar holds five things. From 64rem the two groups
 * dissolve (`lg:contents`) into one column, which also carries the wordmark and the ranking (on a phone the ranking is a
 * row at the top of the diary).
 * The current tab lights a stretch of the hairline it sits against: the top edge of the bar, the right edge of the rail.
 */
export function TabBar({ circleId, me }: { circleId: string; me: { id: string; name: string; image?: string | null } }) {
  const t = useTranslations("tabs");
  const ta = useTranslations("account");
  const pathname = usePathname();
  const base = `/c/${circleId}`;

  const tab = (key: keyof typeof icons, href: string, railOnly = false) => {
    const active = href === base ? pathname === base : pathname.startsWith(href);
    const Icon = icons[key];
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${railOnly ? "hidden" : "grid"} relative min-h-12 min-w-0 content-center justify-items-center gap-1 text-xs transition-colors duration-150 lg:flex lg:min-h-11 lg:items-center lg:justify-start lg:gap-3 lg:px-3 lg:text-base ${
          active
            ? "text-ink before:absolute before:inset-x-4 before:top-[calc(-0.5rem-1px)] before:h-0.5 before:bg-accent before:[animation:mark-x_220ms_var(--ease-out)_backwards] lg:bg-paper-2 lg:before:[animation:mark-y_220ms_var(--ease-out)_backwards] lg:before:inset-x-auto lg:before:right-[calc(-0.75rem-1px)] lg:before:top-0 lg:before:h-full lg:before:w-0.5"
            : "text-muted hover:text-ink lg:hover:bg-paper-2"
        }`}
      >
        <Icon size={22} strokeWidth={1.6} aria-hidden="true" className={active ? "text-accent" : ""} />
        <span className="max-w-full truncate px-0.5">{t(key)}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Pausa"
      className="sticky bottom-0 z-[200] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 border-t border-rule bg-paper px-1 pb-[max(env(safe-area-inset-bottom),8px)] lg:bg-transparent pt-2 lg:top-0 lg:order-1 lg:h-dvh lg:w-56 lg:shrink-0 lg:grid-cols-1 lg:content-start lg:gap-1 lg:border-r lg:border-t-0 lg:px-3 lg:pb-6 lg:pt-8"
    >
      <Link href={base} aria-label="Pausa" className="hidden lg:-order-2 lg:mb-6 lg:flex lg:min-h-11 lg:items-center lg:px-3">
        <Wordmark size="text-3xl" />
      </Link>
      <div className="grid grid-cols-2 lg:contents">
        {tab("diary", base)}
        {tab("serata", `${base}/serata`)}
      </div>
      <Link
        href={`${base}/log`}
        aria-label={t("log")}
        className="grid size-12 place-items-center justify-self-center bg-accent text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97] lg:-order-1 lg:mb-4 lg:h-12 lg:w-full lg:justify-self-stretch"
      >
        <Plus size={24} strokeWidth={1.8} aria-hidden="true" />
      </Link>
      <div className="grid grid-cols-2 lg:contents">
        {tab("lists", `${base}/lists`)}
        {tab("ranking", `${base}/ranking`, true)}
        {tab("circle", `${base}/members`)}
      </div>
      {/* Desktop only: who you are, and the way out. On phones the same lives in the Cerchia tab and the diary header. */}
      <div className="hidden lg:mt-auto lg:grid lg:gap-1 lg:border-t lg:border-rule lg:pt-4">
        <Link href="/account" className="flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-150 hover:bg-paper-2">
          <Avatar user={me} size={28} />
          <span className="min-w-0"><span className="block truncate font-semibold">{me.name}</span><span className="block text-xs text-muted">{ta("profile")}</span></span>
        </Link>
        <LogoutButton className="flex min-h-11 items-center px-3 text-left text-sm text-muted transition-colors duration-150 hover:bg-paper-2 hover:text-ink" />
      </div>
    </nav>
  );
}
