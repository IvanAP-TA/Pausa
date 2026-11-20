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
 * On phones the bar is three tracks, `2fr auto 3fr`, so every tab is the same width: Diario and Serata, then "Registra"
 * (the +), then Classifica, Cerchia and Profilo (my picture, round). The lists live in the diary
 * and in the Cerchia page on a phone, and get their own row on the rail.
 * Pages reached from the diary (a title, an entry, a person, the notifications) keep the Diario tab lit, so the bar
 * always says where you are. The current tab lights a stretch of the hairline it sits against.
 */
export function TabBar({ circleId, me }: { circleId: string; me: { id: string; name: string; image?: string | null } }) {
  const t = useTranslations("tabs");
  const pathname = usePathname();
  const base = `/c/${circleId}`;
  const underDiary = ["/m/", "/l/", "/p/", "/notifications", "/insights", "/import"].some((p) => pathname.startsWith(`${base}${p}`));

  const tab = (key: keyof typeof icons, href: string, railOnly = false) => {
    const active = href === base ? pathname === base || underDiary : pathname.startsWith(href);
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

  const logging = pathname.startsWith(`${base}/log`);
  const mine = pathname === "/me" || pathname.startsWith("/me/") || pathname.startsWith("/account");

  return (
    <nav
      aria-label="Pausa"
      className="sticky bottom-0 z-[200] grid grid-cols-[minmax(0,2fr)_auto_minmax(0,3fr)] items-center gap-x-1 border-t border-rule bg-paper px-1 pb-[max(env(safe-area-inset-bottom),8px)] lg:bg-transparent pt-2 lg:top-0 lg:order-1 lg:h-dvh lg:w-56 lg:shrink-0 lg:grid-cols-1 lg:content-start lg:gap-1 lg:border-r lg:border-t-0 lg:px-3 lg:pb-6 lg:pt-8"
    >
      <Link href={base} aria-label="Pausa" className="hidden lg:-order-2 lg:mb-6 lg:flex lg:min-h-11 lg:items-center lg:px-3">
        <Wordmark size="text-3xl" />
      </Link>
      <div className="grid grid-cols-2 lg:contents">
        {tab("diary", base)}
        {tab("serata", `${base}/serata`)}
      </div>
      {/* The one action of the app, named: "Registra" under the square on a phone, the whole phrase on the rail. */}
      <Link
        href={`${base}/log`}
        aria-current={logging ? "page" : undefined}
        aria-label={t("log")}
        className="group grid min-w-16 justify-items-center gap-1 px-1 text-xs font-semibold text-ink lg:-order-1 lg:mb-4 lg:flex lg:h-12 lg:w-full lg:items-center lg:justify-center lg:gap-2 lg:bg-accent lg:text-base lg:text-accent-ink lg:transition-[background-color,transform] lg:duration-150 lg:hover:bg-accent-hover lg:active:scale-[0.98]"
      >
        <span className="grid size-10 place-items-center bg-accent text-accent-ink transition-[background-color,transform] duration-150 group-hover:bg-accent-hover group-active:scale-[0.94] lg:size-auto lg:bg-transparent lg:group-hover:bg-transparent">
          <Plus size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <span aria-hidden="true" className="lg:hidden">{t("logShort")}</span>
        <span aria-hidden="true" className="hidden lg:inline">{t("log")}</span>
      </Link>
      <div className="grid grid-cols-3 lg:contents">
        {tab("ranking", `${base}/ranking`)}
        {tab("lists", `${base}/lists`, true)}
        {tab("circle", `${base}/members`)}
        {/* Me: my picture, round, as the last tab; everything that is only mine lives behind it. */}
        <Link
          href="/me"
          aria-current={mine ? "page" : undefined}
          className={`relative grid min-h-12 min-w-0 content-center justify-items-center gap-1 text-xs transition-colors duration-150 lg:flex lg:min-h-11 lg:items-center lg:justify-start lg:gap-3 lg:px-3 lg:text-base ${mine ? "text-ink before:absolute before:inset-x-4 before:top-[calc(-0.5rem-1px)] before:h-0.5 before:bg-accent lg:bg-paper-2 lg:before:inset-x-auto lg:before:right-[calc(-0.75rem-1px)] lg:before:top-0 lg:before:h-full lg:before:w-0.5" : "text-muted hover:text-ink lg:hover:bg-paper-2"}`}
        >
          <Avatar user={me} size={24} className={mine ? "ring-2 ring-accent" : ""} />
          <span className="max-w-full truncate px-0.5">{t("profile")}</span>
        </Link>
      </div>
      {/* Desktop only: the way out, at the foot of the rail. */}
      <div className="hidden lg:mt-auto lg:grid lg:border-t lg:border-rule lg:pt-4">
        <LogoutButton className="flex min-h-11 items-center px-3 text-left text-sm text-muted transition-colors duration-150 hover:bg-paper-2 hover:text-ink" />
      </div>
    </nav>
  );
}
