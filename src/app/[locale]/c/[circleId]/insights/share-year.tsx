"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/** Shares the year card as an image (native share sheet where the browser allows it, a download otherwise). */
export function ShareYear({ circleId, year }: { circleId: string; year: number }) {
  const t = useTranslations("insights.yearCard");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/circle/${circleId}/year/${year}/card?locale=${locale}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], `pausa-${year}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: t("shareText", { year }) });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1">
      <button type="button" onClick={share} disabled={busy}
        className="min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {busy ? t("preparing") : t("share")}
      </button>
      {failed && <p role="alert" className="text-xs text-accent">{t("failed")}</p>}
    </div>
  );
}
