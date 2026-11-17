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
    return <p role="status" className="text-lead text-ink">{t("linkSent")}</p>;
  }

  return (
    <div className="grid gap-5">
      {google && embedded && <p className="text-sm text-ink-2">{t("embeddedHint")}</p>}
      {!embedded && (
        <>
          <GoogleButton callbackURL={callbackURL} enabled={google} />
          {(google || process.env.NODE_ENV === "development") && (
            <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">{t("or")}</p>
          )}
        </>
      )}
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-1">
          <label htmlFor="email" className="field-label">{t("email")}</label>
          <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="field" />
        </div>
        <button disabled={status === "sending"} className="btn btn-primary w-full">
          {status === "sending" ? t("sending") : t("sendLink")}
        </button>
        {status === "error" && <p role="alert" className="text-sm text-error">{t("error")}</p>}
      </form>
    </div>
  );
}
