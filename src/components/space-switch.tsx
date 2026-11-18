import { User, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SpaceMenu } from "./space-menu";

type Circle = { id: string; name: string };

/**
 * The places of Pausa, always in sight: the bar stays at the top of the screen while the page scrolls. My own space
 * (everything I watched, private until I share it) and the Cerchia (what the group sees); the one I am in is lit.
 * The arrow at the end opens all of them, and the way to join or create another: any space is one tap away from any page.
 */
export async function SpaceSwitch({ current, circle, circles = [] }: { current: "personal" | "circle"; circle: Circle | null; circles?: Circle[] }) {
  const t = await getTranslations("space");
  const cell = (active: boolean) =>
    `flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-3 text-sm transition-colors duration-150 ${active ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`;
  return (
    <nav aria-label={t("switch")} className="sticky top-0 z-[250] grid border-b border-rule bg-paper grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Link href="/me" aria-current={current === "personal" ? "page" : undefined} className={cell(current === "personal")}>
        <User size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{t("personal")}</span>
      </Link>
      <Link href={circle ? `/c/${circle.id}` : "/"} aria-current={current === "circle" ? "page" : undefined} className={cell(current === "circle")}>
        <Users size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{circle ? circle.name : t("circles")}</span>
      </Link>
      <SpaceMenu
        circles={circles.map((c) => ({ id: c.id, name: c.name }))}
        currentId={current === "circle" ? circle?.id ?? null : null}
        labels={{ open: t("switchOpen"), title: t("switchTitle"), personal: t("personal"), here: t("here"), more: t("moreCircles") }}
      />
    </nav>
  );
}
