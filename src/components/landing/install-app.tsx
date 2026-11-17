"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Platform = "ios" | "android" | "desktop";

const detect = (): Platform => {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
};

/**
 * "Download the app" = install it from the browser (no store): one tap where the browser offers it (Chrome, Edge, Android),
 * clear steps everywhere else (iPhone, Safari). Hidden once Pausa is already running as an installed app.
 */
export function InstallApp({ className = "" }: { className?: string }) {
  const t = useTranslations("landing.install");
  const dialog = useRef<HTMLDialogElement>(null);
  const deferred = useRef<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Browser-only facts (user agent, display mode): they cannot be known during server rendering.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlatform(detect());
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onPrompt = (e: Event) => { e.preventDefault(); deferred.current = e as InstallEvent; };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;

  async function click() {
    const e = deferred.current;
    if (e) {
      deferred.current = null;
      await e.prompt();
      if ((await e.userChoice).outcome === "accepted") return;
    }
    dialog.current?.showModal();
  }

  const order: Platform[] = [platform, ...(["ios", "android", "desktop"] as Platform[]).filter((p) => p !== platform)];

  return (
    <>
      <button type="button" onClick={click} className={className}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-2 shrink-0">
          <path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14" />
        </svg>
        {t("button")}
      </button>
      <dialog ref={dialog} aria-labelledby="install-title"
        className="fixed inset-0 m-auto h-fit w-[min(92vw,30rem)] rounded-md border border-rule bg-paper p-0 text-ink backdrop:bg-black/50">
        <form method="dialog" className="grid gap-4 p-6">
          <h2 id="install-title" className="font-display text-2xl leading-tight">{t("title")}</h2>
          <p className="text-sm text-muted">{t("intro")}</p>
          <ol className="grid gap-3">
            {order.map((p, i) => (
              <li key={p} className={`rounded-md border p-3 text-sm ${i === 0 ? "border-accent bg-paper-2" : "border-rule"}`}>
                <strong className="block font-semibold">{t(`${p}.name`)}{i === 0 ? ` · ${t("yours")}` : ""}</strong>
                <span className="text-muted">{t(`${p}.steps`)}</span>
              </li>
            ))}
          </ol>
          <button className="min-h-11 w-fit rounded-full bg-ink px-6 text-sm font-semibold text-paper hover:opacity-90">{t("close")}</button>
        </form>
      </dialog>
    </>
  );
}
