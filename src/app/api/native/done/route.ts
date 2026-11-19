import { getAuth } from "@/lib/auth";
import { safeNext } from "@/lib/native-shell";

const COPY: Record<string, { title: string; body: string; button: string }> = {
  it: { title: "Accesso riuscito", body: "Torna a Pausa: se non si apre da sola, tocca il pulsante.", button: "Apri Pausa" },
  en: { title: "You are signed in", body: "Go back to Pausa: if it does not open by itself, tap the button.", button: "Open Pausa" },
  es: { title: "Has entrado", body: "Vuelve a Pausa: si no se abre sola, toca el botón.", button: "Abrir Pausa" },
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The browser lands here after signing in (Google, or the email link started from the shell). It gives the signed-in session a
 * single-use token and opens the shell with it through the pausa:// link; the shell swaps it for its own session (api/native/exchange).
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.redirect(new URL(`/it/sign-in?next=${encodeURIComponent(next)}`, request.url), 302);

  const { token } = await auth.api.generateOneTimeToken({ headers: request.headers });
  const link = `pausa://auth?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  const c = COPY[next.split("/")[1] ?? ""] ?? COPY.en!;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="dark"><title>Pausa</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-content:center;gap:16px;padding:24px;background:#001113;color:#eee9de;font:18px/1.5 system-ui,sans-serif;text-align:center}
h1{margin:0;font-size:28px}a{justify-self:center;background:#ff8a4c;color:#001113;font-weight:600;text-decoration:none;padding:14px 28px}</style></head>
<body><h1>${esc(c.title)}</h1><p>${esc(c.body)}</p><a href="${esc(link)}">${esc(c.button)}</a>
<script>location.href=${JSON.stringify(link).replace(/</g, "\u003c")}</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
