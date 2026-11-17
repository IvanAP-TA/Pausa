"use client";

import { SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * One press switches between the dark print and the cream paper. Same cookie as the theme select in the Cerchia page.
 * It keeps no state: the document's `data-theme` is the truth, and one icon (half sun, half moon) serves both modes.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("common");

  function flip() {
    // What the page shows right now, whichever of dark, light or system is set.
    const showsLight = getComputedStyle(document.documentElement).colorScheme.trim().startsWith("light");
    const next = showsLight ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={t("theme")}
      className={`grid size-11 place-items-center text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink active:translate-y-px ${className}`}
    >
      <SunMoon size={22} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
