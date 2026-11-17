"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-4 px-5 py-12">
      <p className="font-display text-sm text-accent">Pausa</p>
      <h1 className="font-display text-[2rem] leading-tight">{t("errorTitle")}</h1>
      <p className="text-muted">{t("errorBody")}</p>
      <button onClick={reset} className="mt-2 inline-flex min-h-12 w-fit items-center rounded-full bg-accent px-6 font-semibold text-on-accent hover:bg-accent-hover">{t("retry")}</button>
    </main>
  );
}
