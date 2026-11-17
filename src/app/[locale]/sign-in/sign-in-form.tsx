"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { isEmbeddedBrowser } from "@/lib/embedded-browser";

type Status = "idle" | "sending" | "sent" | "error";

const noop = () => () => {};
/** The user agent, read on the client only (the server renders as if it were an ordinary browser, then this settles). */
const useEmbedded = () => useSyncExternalStore(noop, () => isEmbeddedBrowser(navigator.userAgent), () => false);

export function SignInForm({ callbackURL, google }: { callbackURL: string; google: boolean }) {
  const t = useTranslations("auth");
  const [status, setStatus] = useState<Status>("idle");
  const embedded = useEmbedded();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setStatus("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return <p role="status" className="rounded-md border border-second bg-second-deep p-4 text-on-second">{t("linkSent")}</p>;
  }

  return (
    <div className="grid gap-6">
      {google && embedded && <p className="rounded-md border border-rule p-3 text-sm text-muted">{t("embeddedHint")}</p>}
      {google && !embedded && (
        <>
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}
            className="min-h-12 rounded-full border border-rule bg-paper-3 font-semibold hover:bg-rule"
          >
            {t("google")}
          </button>
          <p className="text-center text-xs text-muted">{t("or")}</p>
        </>
      )}
      <form onSubmit={onSubmit} className="grid gap-2">
        <label htmlFor="email" className="text-sm text-muted">{t("email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email"
          className="min-h-12 rounded-sm border border-rule bg-paper-2 px-4" />
        <button
          disabled={status === "sending"}
          className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {status === "sending" ? t("sending") : t("sendLink")}
        </button>
        {status === "error" && <p role="alert" className="text-sm text-accent">{t("error")}</p>}
      </form>
    </div>
  );
}
