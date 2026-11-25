import type { CircleSummary } from "@pausa/api-types";
import { useEffect, useSyncExternalStore } from "react";
import { readStored, writeStored } from "@/theme/pref-storage";
import { useSession } from "./session";

const KEY = "pausa-circle";
let stored: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The last Cerchia the person used, remembered on this device (same storage as the theme: localStorage on web, the keystore store on native). */
function load() {
  if (loaded) return;
  loaded = true;
  void readStored(KEY).then((v) => {
    if (v && v !== stored) {
      stored = v;
      emit();
    }
  });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const snapshot = () => stored;

export type CurrentCircle = {
  /** The Cerchia in use: the remembered one if the person is still in it, else the first one; null when they have none. */
  circleId: string | null;
  setCircleId: (id: string) => void;
  circle: CircleSummary | null;
};

const setCircleId = (id: string) => {
  if (id === stored) return;
  stored = id;
  void writeStored(KEY, id);
  emit();
};

/** `{ circleId, setCircleId, circle }`. Safe under the shell: with no session yet it answers `null`. */
export function useCurrentCircle(): CurrentCircle {
  const { state } = useSession();
  const remembered = useSyncExternalStore(subscribe, snapshot, () => null);
  useEffect(load, []);
  const circles = state.status === "ready" ? state.me.circles : [];
  const circle = circles.find((c) => c.id === remembered) ?? circles[0] ?? null;
  return { circleId: circle?.id ?? null, setCircleId, circle };
}
