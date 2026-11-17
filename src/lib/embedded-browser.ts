/**
 * Is this user agent an in-app browser (a WebView inside WhatsApp, Instagram, Facebook, Line, TikTok...)?
 * Google refuses OAuth sign-in there (`disallowed_useragent`), so the Google button is hidden and the email link is offered.
 * Pure on purpose: it is tested with real user-agent strings.
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
