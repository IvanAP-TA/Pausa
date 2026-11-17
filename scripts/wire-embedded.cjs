/* One-off: hide Google in in-app browsers; link Google to an existing email account. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/app/[locale]/sign-in/sign-in-form.tsx", [
  ['import { useState } from "react";', 'import { useState, useSyncExternalStore } from "react";'],
  ['import { authClient } from "@/lib/auth-client";', 'import { authClient } from "@/lib/auth-client";\nimport { isEmbeddedBrowser } from "@/lib/embedded-browser";'],
  ['type Status = "idle" | "sending" | "sent" | "error";\n', 'type Status = "idle" | "sending" | "sent" | "error";\n\nconst noop = () => () => {};\n/** The user agent, read on the client only (the server renders as if it were an ordinary browser, then this settles). */\nconst useEmbedded = () => useSyncExternalStore(noop, () => isEmbeddedBrowser(navigator.userAgent), () => false);\n'],
  ['  const [status, setStatus] = useState<Status>("idle");\n', '  const [status, setStatus] = useState<Status>("idle");\n  const embedded = useEmbedded();\n'],
  ['      {google && (\n        <>', '      {google && embedded && <p className="rounded-md border border-rule p-3 text-sm text-muted">{t("embeddedHint")}</p>}\n      {google && !embedded && (\n        <>'],
]);

edit("src/lib/auth.ts", [
  ['    advanced: {', '    // Someone who signed in with an email link and later taps "Continue with Google" (same address) gets the same account.\n    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },\n    advanced: {'],
]);

fs.writeFileSync("scripts/messages-batch12.json", JSON.stringify({
  it: { auth: { embeddedHint: "Google non funziona dentro WhatsApp o Instagram. Usa l'email qui sotto, oppure apri questa pagina nel browser del telefono." } },
  en: { auth: { embeddedHint: "Google does not work inside WhatsApp or Instagram. Use the email below, or open this page in your phone's browser." } },
  es: { auth: { embeddedHint: "Google no funciona dentro de WhatsApp o Instagram. Usa el email de abajo, o abre esta página en el navegador del móvil." } },
}));
