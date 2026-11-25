// What the page knows about the service worker: only "a new version is waiting". A 20-line external store so the banner can use
// useSyncExternalStore and the registration code (web only) does not have to import React.
type Listener = () => void;
const listeners = new Set<Listener>();
let ready = false;
let apply: (() => void) | null = null;

export const updateStore = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  getSnapshot: () => ready,
  getServerSnapshot: () => false,
  /** Registration calls this when a worker is waiting; `onApply` activates it (and the page reloads). */
  setWaiting(onApply: () => void) {
    ready = true;
    apply = onApply;
    listeners.forEach((fn) => fn());
  },
  /** The "update" button. */
  apply: () => apply?.(),
  /** For tests. */
  reset() {
    ready = false;
    apply = null;
    listeners.forEach((fn) => fn());
  },
};
