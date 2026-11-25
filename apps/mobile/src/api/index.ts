import { Platform } from "react-native";
import { createClient } from "./client";
import { endpoints } from "./endpoints";
import { getToken } from "./token";

/**
 * Production web: same origin (the Worker serves both), so "". Dev: EXPO_PUBLIC_API_URL=http://localhost:8798.
 * Native has no origin of its own, so it falls back to production and is overridden the same way in dev.
 */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "" : "https://pausa.gnagno.org");

const listeners = new Set<() => void>();
/** The session provider subscribes to hear about a 401 from anywhere. */
export const onUnauthorized = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const client = createClient({
  baseUrl: API_URL,
  getToken,
  credentials: Platform.OS === "web" ? "include" : undefined,
  onUnauthorized: () => listeners.forEach((fn) => fn()),
});
export const api = endpoints(client);
export { ApiFailure, errorMessage } from "./errors";
