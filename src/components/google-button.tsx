"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { isEmbeddedBrowser } from "@/lib/embedded-browser";

const noop = () => () => {};

/** True inside WhatsApp, Instagram and similar in-app browsers, where Google refuses sign-in. Read on the client only. */
export function useEmbedded() {
  return useSyncExternalStore(noop, () => isEmbeddedBrowser(navigator.userAgent), () => false);
}

/**
 * "Continue with Google". Shown only where it can work: the page decides whether Google is configured (`enabled`),
 * and it hides itself in in-app browsers. For a guest of a Serata it upgrades the guest to a real account, keeping their votes.
 */
export function GoogleButton({ callbackURL, enabled, className = "" }: { callbackURL: string; enabled: boolean; className?: string }) {
  const t = useTranslations("auth");
  const embedded = useEmbedded();
  if (embedded) return null;
  // Development without Google keys: show where the button will be, so the layout can be judged. It does nothing until the keys exist.
  if (!enabled) {
    if (process.env.NODE_ENV !== "development") return null;
    return (
      <div className="grid gap-1">
        <button type="button" disabled className={`inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-dashed border-rule px-5 font-semibold opacity-60 ${className}`}>{t("google")}</button>
        <p className="text-center text-xs text-muted">Solo sviluppo: imposta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET per attivarlo (docs/DEPLOY.md, sezione 5).</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}
      className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-rule bg-paper-3 px-5 font-semibold hover:bg-rule ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.7 1.8l3.5-3.5A12 12 0 0 0 1.2 6.6l4 3.1c1-2.9 3.6-4.9 6.8-4.9z" />
      </svg>
      {t("google")}
    </button>
  );
}
