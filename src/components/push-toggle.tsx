"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { subscribePush, unsubscribePush } from "@/lib/push-actions";

type State = "loading" | "unsupported" | "off" | "on" | "blocked" | "needs-install";

const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");
const keyBytes = (key: string) => {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Turns Web Push on or off for this device. iPhones only get push from an installed Home Screen app, so we say so. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const t = useTranslations("pushSettings");
  const locale = useLocale();
  const [state, setState] = useState<State>("loading");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (ios && !standalone) return setState("needs-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      setState(existing && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await subscribePush({ endpoint: s.endpoint, p256dh: b64(s.getKey("p256dh")), auth: b64(s.getKey("auth")), locale });
      setState("on");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.getSubscription();
      if (s) { await unsubscribePush(s.endpoint); await s.unsubscribe(); }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-2 rounded-md bg-paper-2 p-4" aria-labelledby="push-title">
      <h2 id="push-title" className="font-display text-lg">{t("title")}</h2>
      <p className="text-sm text-muted">{t("body")}</p>
      {state === "unsupported" && <p className="text-sm text-muted">{t("unsupported")}</p>}
      {state === "needs-install" && <p className="text-sm text-muted">{t("iosHint")}</p>}
      {state === "blocked" && <p className="text-sm text-accent">{t("blocked")}</p>}
      {state === "off" && (
        <button type="button" onClick={enable} disabled={busy} className="min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">{t("enable")}</button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-second-text">{t("enabled")}</p>
          <button type="button" onClick={disable} disabled={busy} className="min-h-11 rounded-full border border-rule px-4 text-sm hover:bg-paper-3 disabled:opacity-60">{t("disable")}</button>
        </div>
      )}
      {failed && <p role="alert" className="text-sm text-accent">{t("failed")}</p>}
    </section>
  );
}
