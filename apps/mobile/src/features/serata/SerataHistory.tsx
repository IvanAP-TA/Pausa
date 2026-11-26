import type { Mode, Recommendation, SerataSummary } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { relativeTime } from "@/features/diary/dates";
import { RequireSession, useMe } from "@/features/session";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Screen } from "@/ui/Screen";
import { Chapter } from "@/ui/Surfaces";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { NewSerata } from "./NewSerata";
import { WatchedSheet } from "./WatchedSheet";
import "./serata.messages";

export { MIN_TITLES, MAX_TITLES } from "./NewSerata";

/** One past Serata: where it stands or who won, how long ago, with its actions (join, open, repeat, "we watched it"). */
function HistoryCard({ s, onChanged }: { s: SerataSummary; onChanged: () => void }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const repeat = useAction();
  const [pick, setPick] = useState(false);
  const done = s.status === "done" && s.winner;
  const open = s.status === "lobby" || s.status === "voting";
  const again = async () => {
    const res = await repeat.run(() => serataApi.repeat(s.code));
    if (res) router.push(href(`/s/${res.value.code}`) as never);
  };
  return (
    <View testID={`serata-${s.code}`} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
      {s.winner ? <MediaPoster title={s.winner.title} path={s.winner.posterPath} width={56} /> : <View style={{ width: 56 }} />}
      <View style={{ flex: 1, minWidth: 0, gap: space["2xs"] }}>
        <Text variant="strong" numberOfLines={2}>
          {done ? t("serata.statusDone", { title: s.winner!.title }) : open ? (s.status === "lobby" ? t("serata.status.lobby") : t("serata.status.voting")) : t("serataApp.history.noResult")}
        </Text>
        <Text variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
          {t(`serata.mode.${s.mode as Mode}`)} · {t("serata.result.people", { count: s.people })} · {relativeTime(s.finishedAt ?? s.createdAt, Date.now(), locale)}
        </Text>
        {s.watched ? <Tag tone="accent" label={`✓ ${t("serataApp.history.watched")}`} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingTop: space.xs }}>
          <Button label={open ? t("serataApp.history.join") : t("serataApp.history.open")} variant={open ? "primary" : "quiet"} href={href(`/s/${s.code}`)} accessibilityLabel={`${open ? t("serataApp.history.join") : t("serataApp.history.open")} ${s.code}`} />
          {done ? <Button label={t("serataApp.history.repeat")} variant="secondary" onPress={again} busy={repeat.busy} testID={`repeat-${s.code}`} /> : null}
          {done && !s.watched ? <Button label={t("serataApp.history.watchedCta")} variant="secondary" onPress={() => setPick(true)} testID={`watched-${s.code}`} /> : null}
        </View>
        {repeat.error ? <Text role="alert" tone="error">{errorMessage(t, repeat.error)}</Text> : null}
      </View>
      {done ? <WatchedSheet code={s.code} winner={s.winner!} open={pick} onClose={() => setPick(false)} onLinked={onChanged} /> : null}
    </View>
  );
}

function History({ circleId }: { circleId: string }) {
  const { t } = useI18n();
  const list = useResource((signal) => serataApi.history(circleId, 20, signal), [circleId]);
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (linked) {
      void list.reload();
      setLinked(false);
    }
  }, [linked, list]);
  if (list.loading && !list.data) return <Loading rows={3} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data || list.data.length === 0) return <Empty title={t("serataApp.history.empty")} body={t("serataApp.history.emptyBody")} />;
  return (
    <View testID="history" style={{ borderTopWidth: hair, borderColor: "transparent" }}>
      {list.data.map((s) => (
        <HistoryCard key={s.code} s={s} onChanged={() => setLinked(true)} />
      ))}
    </View>
  );
}

/** The recommendation engine on this group: what somebody loved and the others have not seen yet. */
function TogetherPicks({ circleId }: { circleId: string }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const recs = useResource((signal) => serataApi.recommendations(circleId, locale, 5, signal), [circleId, locale]);
  const list = (names: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ gap: space["2xs"] }}>
        <Chapter>{t("insights.recs.title")}</Chapter>
        <Text variant="small" tone="muted">{t("insights.recs.body")}</Text>
      </View>
      {recs.loading && !recs.data ? <Loading rows={2} /> : null}
      {recs.error ? <ErrorState error={recs.error} onRetry={recs.reload} /> : null}
      {recs.data && recs.data.length === 0 ? <Text tone="muted">{t("insights.recs.empty")}</Text> : null}
      {recs.data?.map((r: Recommendation) => (
        <View key={r.media.id} testID={`rec-${r.media.id}`} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }}>
          <MediaPoster title={r.media.title} path={r.media.posterPath} width={56} />
          <View style={{ flex: 1, minWidth: 0, gap: space["3xs"] }}>
            <Text variant="strong" numberOfLines={2}>{r.media.title}</Text>
            {r.lovedBy.length > 0 ? <Text variant="small" tone="ink2">{t("insights.recs.lovedBy", { names: list(r.lovedBy.map((l) => l.person.name)) })}</Text> : null}
            <Text variant="small" tone="muted">{t("insights.recs.unseenBy", { names: list(r.unseenBy.map((p) => p.name)) })}</Text>
            <View style={{ flexDirection: "row", paddingTop: space["2xs"] }}>
              <Button label={t("media.logIt")} accessibilityLabel={`${t("media.logIt")}: ${r.media.title}`} variant="quiet" size="sm" href={`${href("/log")}?media=${r.media.id}&circle=${circleId}`} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function SerataHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <Inner circleId={String(id)} />
    </RequireSession>
  );
}

function Inner({ circleId }: { circleId: string }) {
  const { t, href } = useI18n();
  const me = useMe();
  const circle = me.circles.find((c) => c.id === circleId);
  return (
    <Screen>
      <BackLink to={href(`/c/${circleId}`)} label={circle?.name ?? t("app.circle.back")} />
      <View style={{ gap: space.xs }}>
        <Heading level={1}>{t("serata.title")}</Heading>
        <Text variant="lead" tone="ink2">{t("serata.lede")}</Text>
      </View>
      <NewSerata circleId={circleId} />
      <TogetherPicks circleId={circleId} />
      <View style={{ gap: space.sm }}>
        <Chapter>{t("serata.recent")}</Chapter>
        <History circleId={circleId} />
      </View>
    </Screen>
  );
}
