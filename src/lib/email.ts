import "server-only";
import it from "../../messages/it.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { routing, type Locale } from "@/i18n/routing";
import { CARD } from "@/lib/card-theme";

const MESSAGES: Record<Locale, typeof it> = { it, en, es };

/** The sign-in link carries callbackURL=/<locale>/…, so the email speaks the language of the page it came from. */
function localeFromLink(url: string): Locale {
  try {
    const cb = new URL(url).searchParams.get("callbackURL") ?? "";
    const code = cb.split("/")[1];
    return (routing.locales as readonly string[]).includes(code) ? (code as Locale) : routing.defaultLocale;
  } catch {
    return routing.defaultLocale;
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendMagicLinkEmail(email: string, url: string) {
  const m = MESSAGES[localeFromLink(url)].email;
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Never log sign-in links in production: fail loudly instead.
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.info(`[pausa] magic link for ${email}: ${url}`);
    // Kept in memory so /api/dev/login can follow it (development only).
    const g = globalThis as { __pausaDevLinks?: Record<string, string> };
    (g.__pausaDevLinks ??= {})[email] = url;
    return;
  }

  const html = `<!doctype html><html><body style="margin:0;background:${CARD.paper};color:${CARD.ink};font-family:Barlow,-apple-system,Segoe UI,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 24px">
<p style="margin:0 0 8px;color:${CARD.ink};font-size:26px;letter-spacing:0.02em;text-transform:uppercase;font-family:Sofia Sans Extra Condensed,Arial Narrow,sans-serif">Pausa</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escape(m.body)}</p>
<a href="${escape(url)}" style="display:inline-block;background:${CARD.accent};color:${CARD.accentInk};font-weight:600;text-decoration:none;padding:14px 24px">${escape(m.subject)}</a>
<p style="margin:32px 0 0;font-size:13px;color:${CARD.muted}">${escape(m.ignore)}</p>
</td></tr></table></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Pausa <accesso@pausa.gnagno.org>",
      to: [email],
      subject: m.subject,
      text: `${m.body}\n\n${url}\n\n${m.ignore}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Email provider error ${res.status}`);
}
