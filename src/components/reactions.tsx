"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bomb, Frown, Heart, Laugh, Popcorn, type LucideIcon } from "lucide-react";
import { toggleReaction } from "@/lib/actions";
import { REACTIONS } from "@/lib/reactions";

type Reaction = { emoji: string; count: number; mine: boolean };

// The emoji stays the stored key and the spoken name; on screen each reaction is drawn as a line icon, like every other icon of the app.
const ICON: Record<string, LucideIcon> = { "😭": Frown, "🍿": Popcorn, "❤️": Heart, "😂": Laugh, "🤯": Bomb };

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
    <div className="flex flex-wrap gap-2">
      {REACTIONS.map((emoji) => {
        const r = byEmoji.get(emoji);
        const Icon = ICON[emoji];
        // Used reactions are cells with a count; mine is lit by the safelight. Unused ones stay quiet until hover or focus.
        return (
          <button
            key={emoji}
            type="button"
            aria-pressed={r?.mine ?? false}
            aria-label={t("react", { emoji })}
            onClick={() => startTransition(async () => { toggle(emoji); await toggleReaction(logId, emoji); })}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border px-2.5 text-sm transition-[background-color,border-color,color] duration-150 active:scale-[0.97] ${
              r?.mine ? "pop border-accent bg-accent font-semibold text-accent-ink" : r ? "border-muted text-ink hover:border-ink" : "border-rule text-muted hover:border-muted hover:text-ink"
            }`}
          >
            {Icon ? <Icon size={20} strokeWidth={1.75} aria-hidden="true" /> : <span aria-hidden="true">{emoji}</span>}
            {r ? <span className="tabular">{r.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
