"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * The landing is a static page, the same for everyone. Someone already signed in who opens it anyway (a bookmark, the
 * bare domain) is sent on to their Cerchia: one small session check, the sign-in cookie cache answers it without a
 * database read. Serata guests (anonymous) stay on the landing.
 */
export function SignedInRedirect() {
  const locale = useLocale();
  useEffect(() => {
    let live = true;
    fetch("/api/auth/get-session", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ user?: { isAnonymous?: boolean | null } } | null>) : null))
      .then((s) => { if (live && s?.user && !s.user.isAnonymous) window.location.replace(`/${locale}/home`); })
      .catch(() => {});
    return () => { live = false; };
  }, [locale]);
  return null;
}
