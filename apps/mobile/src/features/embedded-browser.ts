/**
 * Is this user agent an in-app browser (a WebView inside WhatsApp, Instagram, Facebook, Line, TikTok...)?
 * Google refuses OAuth sign-in there (`disallowed_useragent`), so the Google button is hidden and the email link is offered.
 * Pure on purpose: it is tested with real user-agent strings. (Port of legacy lib/embedded-browser.ts.)
 */
export function isEmbeddedBrowser(ua: string): boolean {
  if (!ua) return false;
  // Apps that announce themselves.
  if (/FBAN|FBAV|FB_IAB|Instagram|Snapchat|MicroMessenger|TikTok|musical_ly|Bytedance|BytedanceWebview|LinkedInApp|\bLine\/|KAKAOTALK|Pinterest/i.test(ua)) return true;
  // Android System WebView: "; wv)" in the platform part.
  if (/; wv\)/.test(ua)) return true;
  // iOS WebView: WebKit without Safari's own "Safari/" token (Safari, Chrome and Firefox on iOS all include it).
  if (/(iPhone|iPad|iPod)/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) return true;
  return false;
}

/**
 * Is the page running inside v1's native shell (the Tauri app still installed on phones: a WebView that loads the site)?
 * Tauri puts this object in every page it loads. There, Google goes through the system browser (/api/native/start) and the
 * email link comes back into the app (/api/native/done). Port of legacy lib/native-shell.ts.
 */
export const isNativeShell = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Where the shell's sign-in hands the session back to the app, then lands on `next`. */
export const nativeDoneUrl = (next: string) => `/api/native/done?next=${encodeURIComponent(next)}`;
