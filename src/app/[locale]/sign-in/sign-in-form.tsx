"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { GoogleButton, useEmbedded } from "@/components/google-button";

type Status = "idle" | "sending" | "sent" | "error";


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
      {!embedded && (
        <>
          <GoogleButton callbackURL={callbackURL} enabled={google} />
          {(google || process.env.NODE_ENV === "development") && <p className="text-center text-xs text-muted">{t("or")}</p>}
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
