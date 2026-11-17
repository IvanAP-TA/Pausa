"use client";

import { useState } from "react";

/** Spoiler-guarded text: blurred until the reader chooses to reveal it. `subtitle` reveals it as a review line. */
export function Spoiler({ label, children, subtitle = false }: { label: string; children: React.ReactNode; subtitle?: boolean }) {
  const [open, setOpen] = useState(false);
  if (open) return <p className={subtitle ? "subtitle" : "mt-2 text-sm"}>{children}</p>;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full border border-dashed border-muted p-3 text-left text-sm text-ink-2 transition-colors duration-150 hover:border-ink hover:text-ink"
    >
      {label}
      <span aria-hidden="true" className="mt-1 block select-none text-ink blur-[5px]">{children}</span>
    </button>
  );
}
