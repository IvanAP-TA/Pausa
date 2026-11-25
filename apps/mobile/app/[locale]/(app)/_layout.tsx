import { Redirect, Slot, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { DEFAULT_LOCALE, I18nProvider, LOCALES, isLocale } from "@/i18n";
import { Shell } from "@/features/Shell";
import { OutboxProvider } from "@/features/offline/OutboxProvider";
import { SessionProvider } from "@/features/session";
import { ShellFallback } from "@/features/ShellFallback";
import { registerServiceWorker } from "@/pwa/register";
import { loadMotion } from "@/ui/motion";

/** Expo Router expands the dynamic segment at the layout that owns it: every private screen is exported once per language. */
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

/**
 * The private app shell: the person's own screens. Strings load on demand (one chunk per locale), the session is checked once,
 * and the tab bar / rail wraps whatever screen is open.
 */
export default function AppLayout() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  // After the first paint: fetch the animation chunk (web only; a no-op on native and for reduced motion).
  useEffect(() => {
    void loadMotion();
    // The service worker is registered here and nowhere else: public pages never load it (web only; native is a no-op).
    registerServiceWorker();
  }, []);
  if (!isLocale(locale)) return <Redirect href={`/${DEFAULT_LOCALE}/home`} />;
  return (
    <I18nProvider locale={locale} deferred fallback={<ShellFallback />}>
      <SessionProvider>
        <OutboxProvider>
          <Shell>
            <Slot />
          </Shell>
        </OutboxProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
