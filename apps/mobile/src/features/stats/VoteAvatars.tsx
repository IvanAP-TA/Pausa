import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { starsText } from "@/ui/Stars";
import { Text } from "@/ui";
import { splitVotes } from "./ranking-controls";
import "./stats.messages";

type P = { userId: string; name: string; image?: string | null };

/** Everyone who saw the title as a round avatar with their vote (a dash when they did not vote); past three, "+N" expands in place. */
export function VoteAvatars({ people, ratings, meId }: { people: P[]; ratings: Map<string, number>; meId: string }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const { shown, hidden } = splitVotes(people, open);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      <View role="list" aria-label={t("ranking.who")} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      {shown.map((p) => {
        const r = ratings.get(p.userId);
        return (
          <View
            key={p.userId}
            role="listitem"
            aria-label={r === undefined ? `${p.name}: ${t("ranking.noRating")}` : `${p.name}: ${t("ranking.rated", { stars: r / 2 })}`}
            style={{ flexDirection: "row", alignItems: "center", gap: space["2xs"], paddingRight: space.xs, borderWidth: hair, borderColor: p.userId === meId ? c.accent : c.rule, minHeight: 32 }}
          >
            <Avatar name={p.name} image={p.image ?? undefined} size={28} />
            <Text aria-hidden variant="small" tone={r === undefined ? "muted" : "ink"} style={{ fontVariant: ["tabular-nums"] }}>
              {r === undefined ? t("stats.ranking.noVote") : starsText(r, locale)}
            </Text>
          </View>
        );
      })}
      </View>
      {hidden > 0 || open ? (
        <Pressable
          role="button"
          aria-expanded={open}
          aria-label={open ? t("stats.ranking.less") : t("stats.ranking.moreLabel", { count: hidden })}
          testID="votes-more"
          onPress={() => setOpen((o) => !o)}
          style={StyleSheet.flatten([{ minHeight: control, minWidth: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: c.rule }, web({ cursor: "pointer" })])}
        >
          <Text variant="small" tone="ink2">{open ? "−" : t("stats.ranking.more", { count: hidden })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
