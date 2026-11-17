"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="projector mx-auto grid min-h-dvh w-full max-w-[40rem] grid-rows-[auto_1fr] px-4 py-6">
      <p className="font-display text-2xl text-ink">Pausa</p>
      <div className="grid content-center gap-4 py-10">
        <h1 className="display text-poster">{t("errorTitle")}</h1>
        <p className="max-w-[45ch] text-lg text-ink-2">{t("errorBody")}</p>
        <button onClick={reset} className="btn btn-primary btn-lg mt-4 w-full sm:w-fit">{t("retry")}</button>
      </div>
    </main>
  );
}
