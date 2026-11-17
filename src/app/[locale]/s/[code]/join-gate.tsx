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
      <header>
        <p className="font-display text-sm font-semibold text-accent">Pausa</p>
        <h1 className="mt-2 font-display text-[2.2rem] font-semibold leading-[1.05]">{t("title")}</h1>
        <p className="mt-3 text-muted">{asGuest ? t("bodyGuest") : t("bodyMember")}</p>
      </header>
      <form onSubmit={enter} className="grid gap-3">
        {asGuest && (
          <label className="grid gap-1.5 text-sm text-muted">
            {t("name")}
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} autoComplete="nickname" autoFocus
              className="min-h-12 rounded-sm border border-rule bg-paper-2 px-4 text-[17px] text-ink" />
          </label>
        )}
        {asGuest && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm text-muted">{t("avatar")}</legend>
            <div role="radiogroup" aria-label={t("avatar")} className="grid grid-cols-8 gap-1.5">
              {GUEST_AVATARS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={avatar === g} onClick={() => setAvatar(g)}
                  className={`grid aspect-square min-h-10 place-items-center rounded-full text-xl transition-transform ${avatar === g ? "scale-110 bg-accent/20 ring-2 ring-accent" : "bg-paper-2 hover:bg-paper-3"}`}>
                  <span aria-hidden="true">{g}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <button disabled={busy || (asGuest && !name.trim())}
          className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {t("cta")}
        </button>
        {error && <p role="alert" className="text-sm text-accent">{t("error")}</p>}
      </form>
    </main>
  );
}
