"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

/** Ends the session and returns to the landing page. A hard navigation clears every cached private page. */
export function LogoutButton({ className = "" }: { className?: string }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    try {
      await authClient.signOut();
    } finally {
      // Deliberately a full page load: it drops every cached private page from the client router.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/${locale}`;
    }
  }

  return (
    <button type="button" onClick={out} disabled={busy} className={className}>
      {busy ? t("loggingOut") : t("logout")}
    </button>
  );
}
