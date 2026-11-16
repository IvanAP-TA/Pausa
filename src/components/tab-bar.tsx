"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const icons = {
  diary: <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h4" />,
  serata: <path d="M4 6h5v4H4zM4 14h5v4H4zM9 8h4v8H9M13 12h7" />,
  lists: <path d="M5 6h14M5 12h14M5 18h9" />,
  circle: <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14 15.2c2.6-.4 5 .9 6 3.8" />,
};

export function TabBar({ circleId }: { circleId: string }) {
  const t = useTranslations("tabs");
  const pathname = usePathname();
  const base = `/c/${circleId}`;

  const tab = (key: keyof typeof icons, href: string) => {
    const active = href === base ? pathname === base : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`grid justify-items-center gap-1 py-1.5 text-[11px] transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
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
      className="sticky bottom-0 z-10 grid grid-cols-5 items-center border-t border-rule bg-paper/80 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur-md"
    >
      {tab("diary", base)}
      {tab("serata", `${base}/serata`)}
      <Link
        href={`${base}/log`}
        aria-label={t("log")}
        className="grid size-12 place-items-center justify-self-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover active:translate-y-px"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      {tab("lists", `${base}/lists`)}
      {tab("circle", `${base}/members`)}
    </nav>
  );
}
