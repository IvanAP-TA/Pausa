// Web: the browser's own online/offline signal (a hint: "online" does not promise the API answers, which is why the queue retries).
export const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function onBackOnline(fn: () => void): () => void {
  window.addEventListener("online", fn);
  const visible = () => document.visibilityState === "visible" && fn();
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("online", fn);
    document.removeEventListener("visibilitychange", visible);
  };
}

/** For useSyncExternalStore: fires when the browser switches between online and offline. */
export function subscribeOnline(fn: () => void): () => void {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}
