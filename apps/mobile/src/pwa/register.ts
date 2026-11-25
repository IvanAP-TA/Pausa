// Web: registers the service worker from the signed-in app shell (the layout of `app/[locale]/(app)`; no public page imports this file).
// Safe update: a new worker installs and waits; this reports it, and `applyUpdate` (the banner's button) tells it to take over and
// reloads when it has. Never reloads by itself: a page does not change code under somebody who is typing a review.
import { updateStore } from "./update-store";

const secure = () => typeof window !== "undefined" && (window.isSecureContext || ["localhost", "127.0.0.1"].includes(location.hostname));
let started = false;

export function registerServiceWorker(): void {
  if (started || !secure() || !("serviceWorker" in navigator)) return;
  started = true;
  const sw = navigator.serviceWorker;
  let reloading = false;
  sw.addEventListener("controllerchange", () => {
    // The first install also fires this (clients.claim): only reload if an update was asked for.
    if (!reloading && pendingReload) {
      reloading = true;
      location.reload();
    }
  });
  let pendingReload = false;
  const waiting = (reg: ServiceWorkerRegistration) => {
    // `controller` is null on the very first visit: that worker is not an update, it simply becomes active.
    if (!reg.waiting || !sw.controller) return;
    updateStore.setWaiting(() => {
      pendingReload = true;
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  };
  void sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(
    (reg) => {
      waiting(reg);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        next?.addEventListener("statechange", () => {
          if (next.state === "installed") waiting(reg);
        });
      });
      // Look for a new version when the app comes back to the foreground (at most once an hour).
      let last = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - last > 3_600_000) {
          last = Date.now();
          void reg.update().catch(() => undefined);
        }
      });
    },
    () => undefined, // offline or blocked: the app works without it
  );
}
