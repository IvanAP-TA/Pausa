"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleReaction } from "@/lib/actions";
import { REACTIONS } from "@/lib/reactions";

type Reaction = { emoji: string; count: number; mine: boolean };

export function Reactions({ logId, initial }: { logId: string; initial: Reaction[] }) {
  const t = useTranslations("feed");
  const [, startTransition] = useTransition();
  const [reactions, toggle] = useOptimistic(initial, (state: Reaction[], emoji: string) => {
    const found = state.find((r) => r.emoji === emoji);
    if (!found) return [...state, { emoji, count: 1, mine: true }];
    return state
      .map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r))
      .filter((r) => r.count > 0);
  });

  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTIONS.map((emoji) => {
        const r = byEmoji.get(emoji);
        // Show used reactions always; unused ones stay quiet until hover/focus of the row.
        return (
          <button
            key={emoji}
            type="button"
            aria-pressed={r?.mine ?? false}
            aria-label={t("react", { emoji })}
            onClick={() => startTransition(async () => { toggle(emoji); await toggleReaction(logId, emoji); })}
            className={`min-h-8 rounded-full border px-2.5 text-xs transition-colors duration-150 ${
              r?.mine ? "border-accent text-accent" : "border-rule text-muted hover:text-ink"
            } ${r ? "" : "opacity-60 hover:opacity-100 focus-visible:opacity-100"}`}
          >
            {emoji}
            {r ? <span className="tabular ml-1">{r.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
