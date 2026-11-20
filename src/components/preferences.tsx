"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { THEMES, THEME_COOKIE, type Theme } from "@/lib/theme";

const NAMES: Record<string, string> = { it: "Italiano", en: "English", es: "Español" };

/** Language and theme: personal preferences, set on the Account page. Both apply at once, no save button. */
export function Preferences({ initialTheme }: { initialTheme: Theme }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function pickTheme(next: Theme) {
    setTheme(next);
    // Applied instantly here; the cookie makes the server render it on the next load (no flash).
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  const select = "field w-auto";
  const row = "flex min-h-11 items-center justify-between gap-4 py-3";
  return (
    <div className="rows grid">
        <label className={row}>
          {t("language")}
          <select value={locale} onChange={(e) => router.replace(pathname, { locale: e.target.value })} className={select}>
            {routing.locales.map((l) => <option key={l} value={l}>{NAMES[l]}</option>)}
          </select>
        </label>
        <label className={row}>
          {t("theme")}
          <select value={theme} onChange={(e) => pickTheme(e.target.value as Theme)} className={select}>
            {THEMES.map((th) => <option key={th} value={th}>{t(`themes.${th}`)}</option>)}
          </select>
        </label>
    </div>
  );
}
