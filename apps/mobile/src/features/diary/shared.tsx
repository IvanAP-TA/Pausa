import type { LogDto, MediaDto, ReactionCount } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useI18n, type MessageKey } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { MediaPoster } from "@/ui/MediaPoster";
import { Stars } from "@/ui/Stars";
import { Tag } from "@/ui/Tag";
import { Text, Title } from "@/ui/Text";
import { useCurrentCircle } from "../current-circle";
import "./diary.messages";

import { num, ymdToMs } from "./dates";
export { msToYmd, num, todayYmd, ymdToMs } from "./dates";

/** The reaction emoji the server stores, with the name the screen reader speaks. */
export const REACTION_NAME: Record<string, MessageKey> = {
  "😭": "feed.reactionName.moved",
  "🍿": "feed.reactionName.popcorn",
  "❤️": "feed.reactionName.love",
  "😂": "feed.reactionName.laugh",
  "🤯": "feed.reactionName.mindblown",
};

/** Opening a screen of a Cerchia makes it the one the tab bar's Serata and the log form default to. */
export function useCircleScope(circleId: string) {
  const { setCircleId } = useCurrentCircle();
  useEffect(() => setCircleId(circleId), [circleId, setCircleId]);
}

export function useEpisodeLabel() {
  const { t } = useI18n();
  return (season: number | null, episode: number | null): string | null => {
    if (season && episode) return t("diary.episodeOf", { season, episode });
    if (season) return t("feed.season", { n: season });
    return null;
  };
}

export function KindTag({ media }: { media: MediaDto }) {
  const { t } = useI18n();
  const k = media.kind === "movie" || media.kind === "tv" || media.kind === "anime" ? media.kind : null;
  return k ? <Tag label={t(`kind.${k}`)} /> : null;
}

/** Read-only reaction counts ("🍿 3"), each spoken with its name. */
export function ReactionSummary({ reactions }: { reactions: ReactionCount[] }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const shown = reactions.filter((r) => r.count > 0);
  if (!shown.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {shown.map((r) => (
        <View key={r.emoji} role="img" aria-label={t("feed.reactCount", { name: REACTION_NAME[r.emoji] ? t(REACTION_NAME[r.emoji]) : r.emoji, count: r.count })} style={{ flexDirection: "row", gap: space["2xs"], borderWidth: hair, borderColor: r.mine ? c.accent : c.rule, paddingHorizontal: space.xs, paddingVertical: 1 }}>
          <Text aria-hidden>{r.emoji}</Text>
          <Text aria-hidden variant="small" tone="ink2">
            {r.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

type CardProps = {
  log: LogDto;
  /** The Cerchia whose thread the card opens. In my own diary: the first Cerchia it is shared with, or the edit screen when none. */
  circleId?: string;
  /** Quick actions under the card (my diary). */
  footer?: React.ReactNode;
  /** Hide "who" when the whole list is one person's. */
  hideAuthor?: boolean;
};

/** One viewing as a card in a list: poster, title, who, stars, the review (or the spoiler gate), reactions. */
export function LogCard({ log, circleId, footer, hideAuthor }: CardProps) {
  const { t, href, date } = useI18n();
  const { c } = useTheme();
  const epLabel = useEpisodeLabel();
  const scope = circleId ?? log.sharedIn[0];
  const thread = scope ? href(`/c/${scope}/log/${log.id}`) : href(`/log/${log.id}`);
  const season = num(log.season);
  const episode = num(log.episode);
  const ep = epLabel(season, episode);
  const year = num(log.media.year);
  const verb = log.isRewatch ? t("feed.rewatched") : t("feed.watched");
  return (
    <View testID={`log-${log.id}`} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md, gap: space.xs }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Link href={href(`/t/${log.media.id}`) as Href} asChild>
          {/* The poster names the link (its title): an aria-label that differs from the visible placeholder initials fails WCAG 2.5.3. */}
          <Pressable role="link" style={StyleSheet.flatten([{ minWidth: control }, web({ cursor: "pointer" })])}>
            <MediaPoster title={log.media.title} path={log.media.posterPath} width={64} decorative={false} />
          </Pressable>
        </Link>
        <Link href={thread as Href} asChild>
          <Pressable role="link" style={StyleSheet.flatten([{ flex: 1, gap: space["2xs"], minHeight: control }, web({ cursor: "pointer" })])}>
            <Title numberOfLines={2} style={{ fontSize: 24, lineHeight: 26 }}>
              {log.media.title}
            </Title>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
              {year ? (
                <Text variant="small" tone="muted">
                  {year}
                </Text>
              ) : null}
              <KindTag media={log.media} />
              {log.isRewatch ? <Tag label={t("feed.rewatched")} /> : null}
            </View>
            {!hideAuthor ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Avatar name={log.author.name} image={log.author.image} size={22} />
                <Text variant="small" tone="ink2" style={{ flexShrink: 1 }}>
                  {log.author.name} {verb}
                </Text>
              </View>
            ) : null}
            <Text variant="small" tone="muted">
              {[date(ymdToMs(log.watchedOn)), ep, log.platform ? t("feed.on", { platform: log.platform }) : null].filter(Boolean).join(" · ")}
            </Text>
            <Stars halves={log.rating} />
          </Pressable>
        </Link>
      </View>
      {log.reviewHidden ? (
        <Link href={`${thread}?reveal=1` as Href} asChild>
          <Pressable role="link" aria-label={t("feed.spoiler")} testID={`spoiler-${log.id}`} style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center", paddingHorizontal: space.sm, borderWidth: hair, borderColor: c.rule, backgroundColor: c.paper2 }, web({ cursor: "pointer" })])}>
            <Text variant="small" tone="ink2">
              {t("feed.spoiler")}
            </Text>
          </Pressable>
        </Link>
      ) : log.review ? (
        <Text numberOfLines={4} tone="ink">
          {log.review}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        <ReactionSummary reactions={log.reactions} />
        {log.commentCount > 0 ? (
          <Text variant="small" tone="muted">
            {t("feed.comments", { count: log.commentCount })}
          </Text>
        ) : null}
      </View>
      {footer}
    </View>
  );
}

/** The links among a Cerchia's screens: a strip that scrolls sideways on a phone, the current one marked. */
export function CircleNav({ circleId, current }: { circleId: string; current: "hub" | "feed" | "ranking" | "insights" | "people" | "lists" | "serate" | "settings" }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const items: Array<{ key: typeof current; label: string; to: string }> = [
    { key: "feed", label: t("diary.nav.feed"), to: href(`/c/${circleId}/feed`) },
    { key: "ranking", label: t("tabs.ranking"), to: href(`/c/${circleId}/ranking`) },
    { key: "insights", label: t("insights.title"), to: href(`/c/${circleId}/insights`) },
    { key: "people", label: t("diary.nav.people"), to: href(`/c/${circleId}`) },
    { key: "lists", label: t("tabs.lists"), to: href(`/lists?circle=${circleId}`) },
    { key: "serate", label: t("tabs.serata"), to: href(`/c/${circleId}/serate`) },
    { key: "settings", label: t("app.circle.settings"), to: href(`/c/${circleId}/settings`) },
  ];
  return (
    <View role="navigation" aria-label={t("diary.nav.label")}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
        {items.map((i) => {
          const on = i.key === current || (current === "hub" && i.key === "people");
          return (
            <Link key={i.key} href={i.to as Href} asChild>
              <Pressable
                role="link"
                aria-current={on ? "page" : undefined}
                style={StyleSheet.flatten([
                  { minHeight: control, paddingHorizontal: space.md, justifyContent: "center", borderWidth: hair, borderColor: on ? c.ink : c.rule, backgroundColor: on ? c.paper3 : "transparent" },
                  web({ cursor: "pointer" }),
                ])}
              >
                <Text variant={on ? "strong" : "body"} tone={on ? "ink" : "ink2"}>
                  {i.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </View>
  );
}
