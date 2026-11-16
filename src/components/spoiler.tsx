"use client";

import { useState } from "react";

/** Spoiler-guarded text: blurred until the reader chooses to reveal it. `subtitle` reveals it as a subtitle line. */
export function Spoiler({ label, children, subtitle = false }: { label: string; children: React.ReactNode; subtitle?: boolean }) {
  const [open, setOpen] = useState(false);
  if (open) return <p className={subtitle ? "subtitle text-[15px] leading-snug" : "mt-2 text-sm"}>{children}</p>;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-1 w-full rounded-sm border border-dashed border-rule p-3 text-left text-[13px] text-muted hover:border-muted"
    >
      {label}
      <span aria-hidden="true" className="mt-1 block select-none text-ink blur-[5px]">{children}</span>
    </button>
  );
}
