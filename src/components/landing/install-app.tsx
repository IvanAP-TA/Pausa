"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";

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
  const titleId = useId(); // the button is on the page twice (hero and download section): each dialog needs its own id
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
        <Download size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
        {t("button")}
      </button>
      <dialog ref={dialog} aria-labelledby={titleId}
        className="fixed inset-0 m-auto h-fit w-[min(92vw,32rem)] border border-rule bg-paper p-0 text-left text-ink backdrop:bg-scrim">
        <form method="dialog" className="grid gap-5 p-6">
          <h2 id={titleId} className="title">{t("title")}</h2>
          <p className="text-ink-2">{t("intro")}</p>
          {/* The device in hand comes first, marked by the amber edge of a current selection. */}
          <ol className="rows">
            {order.map((p, i) => (
              <li key={p} className={`grid gap-1 py-4 ${i === 0 ? "border-l-2 border-l-accent pl-4" : ""}`}>
                <strong className="block">{t(`${p}.name`)}{i === 0 ? `, ${t("yours")}` : ""}</strong>
                <span className="text-sm text-ink-2">{t(`${p}.steps`)}</span>
              </li>
            ))}
          </ol>
          <button className="btn w-full sm:w-fit">{t("close")}</button>
        </form>
      </dialog>
    </>
  );
}
