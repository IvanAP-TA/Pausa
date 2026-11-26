import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { peopleApi } from "@/api/people";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { BellOff } from "@/ui/lucide";
import { Section } from "@/ui/Section";
import { Text } from "@/ui";

type State = "loading" | "unsupported" | "off" | "on" | "blocked" | "needs-install" | "server-off";

const b64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");
const keyBytes = (key: string) => {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

/** Turns Web Push on or off for this browser (v1 `push-toggle`). An iPhone only gets push from an installed Home Screen app, so it says so. Web only. */
export function PushToggle() {
  if (Platform.OS !== "web") return null;
  return <WebPush />;
}

function WebPush() {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const set = (s: State) => alive && setState(s);
    (async () => {
      try {
        setKey((await peopleApi.pushKey()).publicKey);
      } catch {
        return set("server-off");
      }
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (ios && !standalone) return set("needs-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return set("unsupported");
      if (Notification.permission === "denied") return set("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = reg ? await reg.pushManager.getSubscription() : null;
      set(existing && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => set("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await peopleApi.pushRegister({ endpoint: s.endpoint, p256dh: b64(s.getKey("p256dh")), auth: b64(s.getKey("auth")), locale });
      setState("on");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setFailed(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.getSubscription();
      if (s) {
        await peopleApi.pushUnregister(s.endpoint);
        await s.unsubscribe();
      }
      setState("off");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  return (
    <Section title={t("pushSettings.title")} lede={state === "server-off" ? t("pushSettings.off") : t("pushSettings.body")}>
      {state === "unsupported" ? (
        <Text variant="small" tone="muted">
          {t("pushSettings.unsupported")}
        </Text>
      ) : null}
      {state === "needs-install" ? (
        <Text variant="small" tone="muted">
          {t("pushSettings.iosHint")}
        </Text>
      ) : null}
      {state === "blocked" ? (
        <View role="status" style={{ flexDirection: "row", gap: space.sm, borderWidth: hair, borderColor: c.rule, padding: space.sm }}>
          <BellOff size={18} strokeWidth={1.6} color={c.ink} />
          <Text variant="small" tone="ink2" style={{ flex: 1 }}>
            {t("pushSettings.blocked")}
          </Text>
        </View>
      ) : null}
      {state === "off" ? <Button label={t("pushSettings.enable")} busy={busy} onPress={enable} testID="push-enable" /> : null}
      {state === "on" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space.sm, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.sm }}>
          <Text variant="small" tone="muted" role="status">
            {t("pushSettings.enabled")}
          </Text>
          <Button label={t("pushSettings.disable")} variant="quiet" busy={busy} onPress={disable} testID="push-disable" />
        </View>
      ) : null}
      {failed ? (
        <Text variant="small" tone="error" role="alert">
          {t("pushSettings.failed")}
        </Text>
      ) : null}
    </Section>
  );
}
