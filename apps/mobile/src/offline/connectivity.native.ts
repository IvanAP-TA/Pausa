// Android / iOS: no network-state module is installed, so the device is assumed online and the queue retries when the app returns to
// the foreground (and on its timer). Adding @react-native-community/netinfo would make "offline" exact; it is not needed for correctness.
import { AppState } from "react-native";

export const isOnline = () => true;

export function onBackOnline(fn: () => void): () => void {
  const sub = AppState.addEventListener("change", (s) => s === "active" && fn());
  return () => sub.remove();
}

export const subscribeOnline = (_fn: () => void): (() => void) => () => undefined;
