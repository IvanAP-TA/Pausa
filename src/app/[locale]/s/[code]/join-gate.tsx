"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { joinSerata } from "@/lib/serata/actions";
import { GUEST_AVATARS } from "@/lib/avatars";

/**
 * Zero-friction entry. Guests type a name and get an anonymous session (a cookie, no OAuth),
 * which works inside WhatsApp / Instagram in-app browsers. Members join with one tap.
 */
export function JoinGate({ code, asGuest, hasSession, defaultName }: { code: string; asGuest: boolean; hasSession: boolean; defaultName: string }) {
  const t = useTranslations("serata.join");
  const router = useRouter();
  const [name, setName] = useState(defaultName === "Anonymous" ? "" : defaultName);
  const [avatar, setAvatar] = useState<string>(GUEST_AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function enter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      if (asGuest && !hasSession) {
        const { error } = await authClient.signIn.anonymous();
        if (error) throw error;
      }
      await joinSerata(code, asGuest ? name : undefined, asGuest ? avatar : undefined);
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-8 px-4 py-12">
      <header className="min-w-0">
        <h1 className="display">{t("title")}</h1>
        <p className="mt-3 text-ink-2">{asGuest ? t("bodyGuest") : t("bodyMember")}</p>
      </header>
      <form onSubmit={enter} className="grid gap-6">
        {asGuest && (
          <label className="field-label">
            {t("name")}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} autoComplete="nickname" autoFocus
              className="field min-h-12 text-lg" />
          </label>
        )}
        {asGuest && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm text-ink-2">{t("avatar")}</legend>
            <div role="radiogroup" aria-label={t("avatar")} className="grid grid-cols-4 justify-items-start gap-3 sm:grid-cols-8">
              {GUEST_AVATARS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={avatar === g} onClick={() => setAvatar(g)}
                  className={`grid size-12 place-items-center rounded-full text-2xl transition-[background-color,transform] duration-150 active:translate-y-px motion-reduce:transition-none ${avatar === g ? "scale-110 bg-paper-3 outline-2 outline-offset-2 outline-accent" : "bg-paper-2 hover:bg-paper-3"}`}>
                  <span aria-hidden="true">{g}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <button disabled={busy || (asGuest && !name.trim())} className="btn btn-primary min-h-12 w-full">
          {t("cta")}
        </button>
        {error && <p role="alert" className="text-sm text-error">{t("error")}</p>}
      </form>
      <p className="font-display text-xl text-muted">Pausa</p>
    </main>
  );
}
