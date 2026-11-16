"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { THEMES, THEME_COOKIE, type Theme } from "@/lib/theme";

const NAMES: Record<string, string> = { it: "Italiano", en: "English", es: "Español" };

export function AccountControls({ initialTheme }: { initialTheme: Theme }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function pickTheme(next: Theme) {
    setTheme(next);
    // Applied instantly here; the cookie makes the server render it on the next load (no flash).
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  const select = "min-h-10 rounded-sm border border-rule bg-paper-2 px-2 text-ink";
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-3 text-sm text-muted">
          {t("language")}
          <select value={locale} onChange={(e) => router.replace(pathname, { locale: e.target.value })} className={select}>
            {routing.locales.map((l) => <option key={l} value={l}>{NAMES[l]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm text-muted">
          {t("theme")}
          <select value={theme} onChange={(e) => pickTheme(e.target.value as Theme)} className={select}>
            {THEMES.map((th) => <option key={th} value={th}>{t(`themes.${th}`)}</option>)}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); }}
        className="min-h-10 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {t("signOut")}
      </button>
    </section>
  );
}
