import it from "../../../messages/it.json";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { digestLines, markDigestSent, pendingDigests, type Digest } from "./digest";
import type { AnyDb } from "./db-types";
import { CARD } from "../card-theme";

/* Sending the daily digest. It takes its settings as arguments (not from process.env) because the Worker's scheduled handler
 * gets secrets through its `env` binding, and it avoids "server-only" modules so the Worker bundle can import it. */

const MESSAGES = { it, en, es } as const;
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type MailerConfig = { apiKey?: string; from?: string; appUrl: string };

export function renderDigest(d: Digest, appUrl: string) {
  const m = MESSAGES[d.locale].email.digest;
  const lines = digestLines(d);
  const more = d.total > d.items.length ? m.more.replace("{count}", String(d.total - d.items.length)) : null;
  const link = `${appUrl.replace(/\/$/, "")}/${d.locale}`;
  const text = [m.intro, "", ...lines.map((l) => `- ${l}`), ...(more ? [more] : []), "", `${m.open}: ${link}`, "", m.settings].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:${CARD.paper};color:${CARD.ink};font-family:Barlow,-apple-system,Segoe UI,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 24px">
<p style="margin:0 0 8px;color:${CARD.ink};font-size:26px;letter-spacing:0.02em;text-transform:uppercase;font-family:Sofia Sans Extra Condensed,Arial Narrow,sans-serif">Pausa</p>
<p style="margin:0 0 16px;font-size:16px">${escape(m.intro)}</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
${more ? `<p style="margin:0 0 16px;font-size:14px;color:${CARD.muted}">${escape(more)}</p>` : ""}
<a href="${escape(link)}" style="display:inline-block;background:${CARD.accent};color:${CARD.accentInk};font-weight:600;text-decoration:none;padding:14px 24px">${escape(m.open)}</a>
<p style="margin:32px 0 0;font-size:13px;color:${CARD.muted}">${escape(m.settings)}</p>
</td></tr></table></body></html>`;
  return { subject: m.subject, text, html };
}

/** Sends one digest through Resend. Without a key (local development) it only logs, and returns false. */
export async function sendDigest(cfg: MailerConfig, d: Digest): Promise<boolean> {
  const { subject, text, html } = renderDigest(d, cfg.appUrl);
  if (!cfg.apiKey) {
    console.info(`[pausa] digest for ${d.email}: ${d.total} notices (no RESEND_API_KEY, not sent)`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from ?? "Pausa <accesso@pausa.gnagno.org>", to: [d.email], subject, text, html }),
  });
  return res.ok;
}

/** The whole job: find who is due, send, and move each person's window forward only if the email went out. */
export async function runDigests(db: AnyDb, cfg: MailerConfig, now = new Date()) {
  const due = await pendingDigests(db, now);
  const sent: string[] = [];
  for (const d of due) {
    try { if (await sendDigest(cfg, d)) sent.push(d.userId); } catch (err) { console.error("[pausa] digest failed", d.userId, err); }
  }
  await markDigestSent(db, sent, now);
  return { due: due.length, sent: sent.length };
}
