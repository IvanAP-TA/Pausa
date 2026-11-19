/** Is the page running inside Pausa's native shell (the Tauri window or Android webview)? Client only; Tauri puts this object in every page it loads. */
export const isNativeShell = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The route that takes a signed-in browser session back to the shell (see api/native/done). `next` is where the shell should land. */
export const nativeDoneUrl = (next: string) => `/api/native/done?next=${encodeURIComponent(next)}`;

/** Where the shell sends the system browser to sign in with Google. */
export const nativeStartUrl = (next: string) => `/api/native/start?next=${encodeURIComponent(next)}`;

/** `next` comes from a URL: only a path inside this app is accepted ("/it/c/..."), never another site or a protocol-relative "//host". */
export function safeNext(raw: string | null | undefined, fallback = "/it"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
