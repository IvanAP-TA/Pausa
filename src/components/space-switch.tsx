import { User, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * The two places of Pausa, always in sight at the top: my own space (everything I watched, private until I share it)
 * and the Cerchia (what the group sees). The one I am in is lit.
 */
export async function SpaceSwitch({ current, circle }: { current: "personal" | "circle"; circle: { id: string; name: string } | null }) {
  const t = await getTranslations("space");
  const cell = (active: boolean) =>
    `flex min-h-11 min-w-0 items-center justify-center gap-2 border-b-2 px-3 text-sm transition-colors duration-150 ${active ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`;
  return (
    <nav aria-label={t("switch")} className="grid grid-cols-2 border-b border-rule">
      <Link href="/me" aria-current={current === "personal" ? "page" : undefined} className={cell(current === "personal")}>
        <User size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{t("personal")}</span>
      </Link>
      <Link href={circle ? `/c/${circle.id}` : "/"} aria-current={current === "circle" ? "page" : undefined} className={cell(current === "circle")}>
        <Users size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{circle ? circle.name : t("circles")}</span>
      </Link>
    </nav>
  );
}
