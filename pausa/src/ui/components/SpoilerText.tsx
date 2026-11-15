"use client";

import { useState } from "react";

export function SpoilerText({ body, isSpoiler }: { body: string; isSpoiler: boolean }) {
  const [revealed, setRevealed] = useState(!isSpoiler);
  if (revealed) return <span className="text-ink">{body}</span>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="rounded bg-surface-2 px-2 py-0.5 text-sm text-ink-dim blur-[3px] transition hover:blur-0"
      aria-label="Mostra spoiler"
    >
      {body}
    </button>
  );
}
