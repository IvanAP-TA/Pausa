"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function CopyInvite({ url }: { url: string }) {
  const t = useTranslations("circle");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copy"), url); // clipboard blocked (some in-app browsers)
    }
  }

  return (
    <button type="button" onClick={copy} aria-live="polite" className="btn btn-primary">
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
