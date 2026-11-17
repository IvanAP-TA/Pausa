"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Avatar } from "./avatar";
import { LogoutButton } from "./logout-button";

const icons = {
  diary: <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h4" />,
  serata: <path d="M4 6h5v4H4zM4 14h5v4H4zM9 8h4v8H9M13 12h7" />,
  ranking: <path d="M5 20V11M12 20V5M19 20v-6" />,
  lists: <path d="M5 6h14M5 12h14M5 18h9" />,
  circle: <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14 15.2c2.6-.4 5 .9 6 3.8" />,
};

export function TabBar({ circleId, me }: { circleId: string; me: { id: string; name: string; image?: string | null } }) {
  const t = useTranslations("tabs");
  const ta = useTranslations("account");
  const pathname = usePathname();
  const base = `/c/${circleId}`;

  const tab = (key: keyof typeof icons, href: string) => {
    const active = href === base ? pathname === base : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`grid justify-items-center gap-1 py-1.5 text-[11px] transition-colors lg:flex lg:items-center lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:py-3 lg:text-[15px] lg:hover:bg-paper-2 ${active ? "text-ink lg:bg-paper-2" : "text-muted hover:text-ink"}`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-accent" : ""} aria-hidden="true">
          {icons[key]}
        </svg>
        <span className="max-w-full truncate px-1">{t(key)}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Pausa"
      className="sticky bottom-0 z-10 grid grid-cols-6 items-center border-t border-rule bg-paper/80 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur-md lg:top-0 lg:order-1 lg:h-dvh lg:w-56 lg:shrink-0 lg:grid-cols-1 lg:content-start lg:gap-1 lg:border-r lg:border-t-0 lg:bg-transparent lg:px-3 lg:pb-6 lg:pt-8 lg:backdrop-blur-none"
    >
      {tab("diary", base)}
      {tab("serata", `${base}/serata`)}
      <Link
        href={`${base}/log`}
        aria-label={t("log")}
        className="grid size-12 place-items-center justify-self-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover active:translate-y-px lg:order-first lg:mb-4 lg:h-12 lg:w-full lg:justify-self-stretch"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      {tab("lists", `${base}/lists`)}
      {tab("ranking", `${base}/ranking`)}
      {tab("circle", `${base}/members`)}
      {/* Desktop only: who you are, and the way out. On phones the same lives in the Cerchia tab and the diary header. */}
      <div className="hidden lg:mt-auto lg:grid lg:gap-1 lg:border-t lg:border-rule lg:pt-4">
        <Link href="/account" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-paper-2">
          <Avatar user={me} size={28} />
          <span className="min-w-0"><span className="block truncate font-semibold">{me.name}</span><span className="block text-xs text-muted">{ta("profile")}</span></span>
        </Link>
        <LogoutButton className="flex min-h-11 items-center rounded-md px-3 text-left text-sm text-muted hover:bg-paper-2 hover:text-ink" />
      </div>
    </nav>
  );
}
