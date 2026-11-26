import type { LogDto, MediaDto, ReactionCount } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { diaryApi, REACTIONS } from "@/api/diary";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useI18n, type MessageKey } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Bomb, Frown, Heart, Laugh, MessageCircle, Popcorn } from "@/ui/lucide";
import { usePressed } from "@/ui/usePressed";
import { MediaPoster } from "@/ui/MediaPoster";
import { Stars } from "@/ui/Stars";
import { Tag } from "@/ui/Tag";
import { Text, Title } from "@/ui/Text";
import { useCurrentCircle } from "../current-circle";
import "./diary.messages";

import { num, relativeTime, ymdToMs } from "./dates";
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

/** v1 reactions: the five drawn as line icons (the emoji stays the stored key and the spoken name). */
const REACTION_ICON: Record<string, typeof Popcorn> = { "😭": Frown, "🍿": Popcorn, "❤️": Heart, "😂": Laugh, "🤯": Bomb };

/**
 * The five reactions, each a toggle, flipped at once and put back if the server says no. v1 look: used ones are cells with
 * a count, mine filled with the accent; unused ones are bare icons until hover, so a quiet entry is not a row of empty boxes.
 */
export function ReactionBar({ circleId, logId, initial }: { circleId: string; logId: string; initial: ReactionCount[] }) {
  const { t } = useI18n();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setState(initial), [initial]);
  const toggle = async (emoji: string) => {
    const before = state;
    const cur = before.find((r) => r.emoji === emoji);
    const on = !cur?.mine;
    const next = cur
      ? before.map((r) => (r.emoji === emoji ? { ...r, mine: on, count: Math.max(0, r.count + (on ? 1 : -1)) } : r))
      : [...before, { emoji, mine: true, count: 1 }];
    setState(next);
    setError(null);
    try {
      await diaryApi.react(circleId, logId, emoji);
    } catch (e) {
      setState(before);
      setError(e);
    }
  };
  return (
    <View style={{ gap: space.xs }}>
      <View role="group" aria-label={t("diary.thread.reactions")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {REACTIONS.map((emoji) => (
          <ReactionButton key={emoji} emoji={emoji} r={state.find((x) => x.emoji === emoji && x.count > 0)} onPress={() => void toggle(emoji)} />
        ))}
      </View>
      {error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, error)}
        </Text>
      ) : null}
    </View>
  );
}

function ReactionButton({ emoji, r, onPress }: { emoji: string; r: ReactionCount | undefined; onPress: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { hovered, pressed, bind } = usePressed();
  const mine = !!r?.mine;
  const name = REACTION_NAME[emoji] ? t(REACTION_NAME[emoji]) : emoji;
  const Icon = REACTION_ICON[emoji];
  const fg = mine ? c.accentInk : r || hovered ? c.ink : c.muted;
  const border = mine ? c.accent : r ? (hovered ? c.ink : c.muted) : hovered ? c.rule : "transparent";
  return (
    <Pressable
      role="button"
      aria-pressed={mine}
      aria-label={`${t("feed.react", { emoji: name })}${r?.count ? `, ${t("feed.reactCount", { name, count: r.count })}` : ""}`}
      testID={`react-${emoji}`}
      onPress={onPress}
      {...bind}
      style={StyleSheet.flatten([
        { minHeight: control, minWidth: control, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: hair, borderColor: border, backgroundColor: mine ? c.accent : "transparent", transform: [{ scale: pressed ? 0.97 : 1 }] },
        web({ cursor: "pointer", transition: "background-color 150ms, border-color 150ms, color 150ms", ...(mine ? { animation: "pausa-pop 200ms cubic-bezier(0.16, 1, 0.3, 1)" } : {}) }),
      ])}
    >
      {Icon ? <Icon size={20} strokeWidth={1.75} color={fg} /> : <Text aria-hidden>{emoji}</Text>}
      {r ? (
        <Text aria-hidden variant="small" style={[{ color: fg, fontWeight: mine ? "600" : "400" }, web({ fontVariantNumeric: "tabular-nums" })]}>
          {r.count}
        </Text>
      ) : null}
    </Pressable>
  );
}

type CardProps = {
  log: LogDto;
  /** The Cerchia whose thread the card opens. In my own diary: the first Cerchia it is shared with, or the edit screen when none. */
  circleId?: string;
  /** Quick actions under the card (my diary). */
  footer?: React.ReactNode;
  /** Hide "who" when the whole list is one person's: the head then says when it was watched. */
  hideAuthor?: boolean;
  /** On the thread itself: no comment button and no last comment (the thread is below). */
  onThread?: boolean;
};

/**
 * v1 LogCard, one log set as a plate on a contact sheet: a hairline above; the author and how long ago; the poster printed large
 * (104, 128 from 40rem) beside the title in display capitals, the facts (kind, year, runtime, episode, platform), the genres,
 * large stars and "Visto con"; two lines of synopsis when there is no review; the review full width at lead size (a spoiler opens
 * in place); the reactions and the comment button; the latest comment of this Cerchia in a well.
 */
export function LogCard({ log, circleId, footer, hideAuthor, onThread }: CardProps) {
  const { t, href, date, locale } = useI18n();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const scope = circleId ?? log.sharedIn[0];
  const thread = scope ? href(`/c/${scope}/log/${log.id}`) : href(`/log/${log.id}`);
  const titleHref = circleId ? href(`/c/${circleId}/m/${log.media.id}`) : href(`/t/${log.media.id}`);
  const season = num(log.season);
  const episode = num(log.episode);
  const year = num(log.media.year);
  const poster = width >= 640 ? 128 : 104;
  const [revealed, setRevealed] = useState<string | null>(null);
  const reveal = useAction();
  const run =
    log.media.kind === "movie" && log.runtimeMin
      ? log.runtimeMin >= 60
        ? t("media.runtimeLong", { h: Math.floor(log.runtimeMin / 60), m: log.runtimeMin % 60 })
        : t("media.runtime", { m: log.runtimeMin })
      : null;
  const kind = log.media.kind === "movie" || log.media.kind === "tv" || log.media.kind === "anime" ? t(`kind.${log.media.kind}`) : null;
  const facts = [
    kind,
    year ? String(year) : null,
    run,
    episode ? (season ? `S${season}·E${episode}` : `E${episode}`) : season ? t("feed.season", { n: season }) : null,
    log.platform ? t("feed.on", { platform: log.platform }) : null,
  ].filter(Boolean);
  const review = revealed ?? log.review;
  const showThreadLinks = !!circleId && !onThread;

  return (
    <View testID={`log-${log.id}`} role="listitem" style={{ borderTopWidth: hair, borderColor: c.rule, paddingVertical: 20, gap: space.md }}>
      {/* who and when */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        {hideAuthor ? (
          <Text variant="small" tone="muted">
            {date(ymdToMs(log.watchedOn))}
          </Text>
        ) : circleId ? (
          <Link href={href(`/c/${circleId}/people/${log.author.id}`) as Href} asChild>
            <Pressable role="link" style={StyleSheet.flatten([{ minHeight: control, flexDirection: "row", alignItems: "center", gap: space.xs }, web({ cursor: "pointer" })])}>
              <Avatar name={log.author.name} image={log.author.image} size={26} />
              <Text variant="small" style={{ fontWeight: "600" }}>
                {log.author.name}
              </Text>
            </Pressable>
          </Link>
        ) : (
          <>
            <Avatar name={log.author.name} image={log.author.image} size={26} />
            <Text variant="small" style={{ fontWeight: "600" }}>
              {log.author.name}
            </Text>
          </>
        )}
        {!hideAuthor ? (
          <Text variant="small" tone="muted">
            {log.isRewatch ? t("feed.rewatched") : t("feed.watched")}
          </Text>
        ) : log.isRewatch ? (
          <Tag label={t("feed.rewatched")} />
        ) : null}
        {!hideAuthor ? (
          <Text variant="small" tone="muted" style={[{ marginLeft: "auto" }, web({ fontVariantNumeric: "tabular-nums" })]}>
            {relativeTime(log.arrivedAt, Date.now(), locale)}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: space.md }}>
        <Link href={titleHref as Href} asChild>
          {/* The poster names the link (its title): an aria-label that differs from the visible placeholder initials fails WCAG 2.5.3. */}
          <Pressable role="link" style={StyleSheet.flatten([{ alignSelf: "flex-start" }, web({ cursor: "pointer" })])}>
            <MediaPoster title={log.media.title} path={log.media.posterPath} width={poster} decorative={false} size="w342" />
          </Pressable>
        </Link>
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Link href={titleHref as Href} asChild>
            <Pressable role="link" style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center" }, web({ cursor: "pointer" })])}>
              <Title role="heading" aria-level={3} style={[{ fontSize: 32, lineHeight: 33 }, web({ overflowWrap: "break-word" })]}>
                {log.media.title}
              </Title>
            </Pressable>
          </Link>
          {facts.length ? (
            <Text variant="small" tone="muted">
              {facts.join(", ")}
            </Text>
          ) : null}
          {log.genres.length ? (
            <Text variant="small" tone="ink2">
              {log.genres.slice(0, 3).join(" · ")}
            </Text>
          ) : null}
          {log.rating ? (
            <View style={{ marginTop: space["2xs"] }}>
              <Stars halves={log.rating} size={23} />
            </View>
          ) : null}
          {log.watchedWith.length ? (
            <View style={{ marginTop: space["2xs"], flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <Text variant="small" tone="muted">
                {t("feed.with")}
              </Text>
              {log.watchedWith.map((w) => (
                <Tag key={w.id} label={w.name} />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* With no review of their own, two lines of what the title is about, so the diary says more than a name. */}
      {!review && !log.reviewHidden && log.overview ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {log.overview}
        </Text>
      ) : null}

      {/* The review is the reader's own voice: full width, at lead size. A spoiler opens in place. */}
      {log.reviewHidden && !revealed ? (
        <Pressable
          role="button"
          aria-label={t("feed.spoiler")}
          testID={`spoiler-${log.id}`}
          disabled={reveal.busy}
          onPress={async () => {
            if (!scope) return;
            const got = await reveal.run(() => diaryApi.thread(scope, log.id, { reveal: true, locale }));
            if (got?.value.log.review) setRevealed(got.value.log.review);
          }}
          style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center", paddingHorizontal: space.sm, borderWidth: hair, borderColor: c.rule, backgroundColor: c.paper2 }, web({ cursor: "pointer" })])}
        >
          <Text variant="small" tone="ink2">
            {t("feed.spoiler")}
          </Text>
        </Pressable>
      ) : review ? (
        <Text variant="lead" testID={`review-${log.id}`} style={[{ lineHeight: 27 }, web({ textWrap: "pretty" })]}>
          {review}
        </Text>
      ) : null}
      {reveal.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, reveal.error)}
        </Text>
      ) : null}

      {circleId ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space.xs }}>
          <ReactionBar circleId={circleId} logId={log.id} initial={log.reactions} />
          {showThreadLinks ? (
            <Button
              size="sm"
              variant="secondary"
              icon={MessageCircle}
              label={log.commentCount > 0 ? t("feed.comments", { count: log.commentCount }) : t("feed.commentCta")}
              href={`${thread}#comments`}
              style={{ minHeight: control }}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          <ReactionSummary reactions={log.reactions} />
          {log.commentCount > 0 ? (
            <Text variant="small" tone="muted">
              {t("feed.comments", { count: log.commentCount })}
            </Text>
          ) : null}
        </View>
      )}

      {/* The latest word on this log, so the feed reads as a conversation. The whole line opens the thread. */}
      {showThreadLinks && log.lastComment ? <LastComment log={log} to={`${thread}#comments`} /> : null}
      {footer}
    </View>
  );
}

/** A list of LogCards: each card draws its own top hairline (v1 `.plate`); nothing closes it, as in v1. */
export function CardList({ children }: { children: React.ReactNode }) {
  return <View role="list">{children}</View>;
}

/** The latest word on a log, in a well: the whole line opens the thread. */
function LastComment({ log, to }: { log: LogDto; to: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  const last = log.lastComment;
  if (!last) return null;
  return (
    <Link href={to as Href} asChild>
      <Pressable role="link" testID={`last-comment-${log.id}`} {...bind} style={StyleSheet.flatten([{ flexDirection: "row", gap: space.sm, padding: space.sm, backgroundColor: hovered ? c.paper3 : c.paper2 }, web({ cursor: "pointer", transition: "background-color 150ms" })])}>
        <Avatar name={last.author.name} image={last.author.image} size={26} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="small">
            <Text variant="small" style={{ fontWeight: "600" }}>
              {last.author.name}
            </Text>{" "}
            <Text variant="small" tone={last.isSpoiler ? "muted" : "ink2"} style={web({ overflowWrap: "anywhere" })}>
              {last.isSpoiler ? t("feed.commentSpoiler") : last.body}
            </Text>
          </Text>
          {log.commentCount > 1 ? (
            <Text variant="small" tone="muted" style={{ marginTop: space["2xs"] }}>
              {t("feed.commentsMore", { count: log.commentCount - 1 })}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** The links among a Cerchia's screens: a strip that scrolls sideways on a phone, the current one marked. */
export function CircleNav({ circleId, current }: { circleId: string; current: "hub" | "feed" | "ranking" | "insights" | "people" | "lists" | "serate" | "settings" }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const items: Array<{ key: typeof current; label: string; to: string }> = [
    { key: "feed", label: t("diary.nav.feed"), to: href(`/c/${circleId}`) },
    { key: "ranking", label: t("tabs.ranking"), to: href(`/c/${circleId}/ranking`) },
    { key: "insights", label: t("insights.title"), to: href(`/c/${circleId}/insights`) },
    { key: "people", label: t("diary.nav.people"), to: href(`/c/${circleId}/members`) },
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
