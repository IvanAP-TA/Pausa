import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { diaryApi } from "@/api/diary";
import { errorMessage } from "@/api/errors";
import { usePages } from "@/api/usePages";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Stars } from "@/ui/Stars";
import { ErrorState, Heading, Loading, Screen, Tag, Text } from "@/ui";
import { RequireSession } from "../session";
import { CardList, KindTag, LogCard, num, useCircleScope } from "./shared";
import "./diary.messages";

/**
 * v1 title page inside a Cerchia: what the title is (original name, facts, genres, the Cerchia's average, synopsis, cast), then what
 * the Cerchia made of it: everyone's viewings of it, as the cards of the feed.
 */
function CircleTitleBody({ circleId, mediaId }: { circleId: string; mediaId: string }) {
  const { t, href, locale } = useI18n();
  useCircleScope(circleId);
  const detail = useResource((signal) => diaryApi.media(mediaId, locale, signal), [mediaId, locale]);
  const mine = useResource((signal) => diaryApi.circleMedia(circleId, mediaId, locale, signal), [circleId, mediaId, locale]);
  const feed = usePages((before, signal) => diaryApi.feed(circleId, { mediaId, before, locale }, signal), [circleId, mediaId, locale]);
  const back = <BackLink to={href(`/c/${circleId}`)} label={t("common.back")} />;

  if ((detail.loading && !detail.data) || (mine.loading && !mine.data))
    return (
      <Screen>
        {back}
        <Loading rows={4} />
      </Screen>
    );
  const failure = detail.error ?? mine.error;
  if (failure || !detail.data || !mine.data)
    return (
      <Screen>
        {back}
        <ErrorState
          error={failure}
          onRetry={() => {
            detail.reload();
            mine.reload();
          }}
        />
      </Screen>
    );
  const d = detail.data;
  const m = mine.data;
  const year = num(d.media.year);
  const runtime = num(d.runtimeMin);
  const average = num(m.average);
  const rated = num(m.rated) ?? 0;
  return (
    <Screen onRefresh={() => void feed.reload()} refreshing={feed.status === "loading" && feed.items.length > 0} onNearEnd={() => void feed.loadMore()}>
      {back}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <MediaPoster title={d.media.title} path={d.media.posterPath} width={120} />
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Heading level={1} style={{ fontSize: 40, lineHeight: 44 }}>
            {d.media.title}
          </Heading>
          {m.originalTitle !== d.media.title ? <Text tone="ink2">{m.originalTitle}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
            <KindTag media={d.media} />
            {year ? (
              <Text variant="small" tone="muted">
                {year}
              </Text>
            ) : null}
            {runtime ? (
              <Text variant="small" tone="muted">
                {runtime >= 60 ? t("media.runtimeLong", { h: Math.floor(runtime / 60), m: runtime % 60 }) : t("media.runtime", { m: runtime })}
              </Text>
            ) : null}
          </View>
          {d.genres.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {d.genres.map((g) => (
                <Tag key={g} label={g} />
              ))}
            </View>
          ) : null}
          {average && rated > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }} testID="circle-average">
              <Stars halves={average} size={18} />
              <Text variant="small" tone="muted">
                {t("media.circleAverage", { count: rated })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("media.logIt")} href={`${href("/log")}?media=${mediaId}&circle=${circleId}`} testID="log-this" />
        <Button label={t("lists.addTo")} variant="secondary" href={`${href("/lists")}?circle=${circleId}&add=${mediaId}`} />
      </View>

      <Section title={t("media.about")}>
        <Text tone={d.overview ? "ink" : "muted"}>{d.overview ?? t("media.noOverview")}</Text>
        {m.source === "user" ? (
          <Text variant="small" tone="muted">
            {t("media.byMember")}
          </Text>
        ) : null}
      </Section>

      {d.cast.length > 0 ? (
        <Section title={t("media.cast")}>
          <View style={{ gap: space["2xs"] }}>
            {d.cast.slice(0, 10).map((p, i) => (
              <Text key={`${p.name}-${i}`} variant="small">
                {p.name}
                {p.role ? <Text variant="small" tone="muted">{`  ${p.role}`}</Text> : null}
              </Text>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={t("media.inCircle")}>
        {feed.status === "loading" ? <Loading rows={2} /> : null}
        {feed.status === "error" ? <ErrorState error={feed.error} onRetry={feed.reload} /> : null}
        {feed.status === "ready" && feed.items.length === 0 ? (
          <Text tone="ink2" testID="circle-title-none">
            {t("media.nobodyYet")}
          </Text>
        ) : null}
        {feed.items.length > 0 ? (
          <CardList>
            {feed.items.map((l) => (
              <LogCard key={l.id} log={l} circleId={circleId} />
            ))}
          </CardList>
        ) : null}
        {feed.more === "loading" ? <Loading rows={1} /> : null}
        {feed.more === "error" ? (
          <View role="alert" style={{ gap: space.xs }}>
            <Text tone="error">{errorMessage(t, feed.moreError)}</Text>
            <Button label={t("errors.retry")} variant="secondary" onPress={() => void feed.loadMore()} />
          </View>
        ) : null}
        {feed.next && feed.more === "idle" ? <Button label={t("diary.feed.more")} variant="secondary" onPress={() => void feed.loadMore()} testID="load-more" /> : null}
      </Section>

      {m.source === "tmdb" ? (
        <Text variant="small" tone="muted">
          {t("tmdb.attribution")}
        </Text>
      ) : null}
    </Screen>
  );
}

export function CircleTitle() {
  const { id, mediaId } = useLocalSearchParams<{ id: string; mediaId: string }>();
  return (
    <RequireSession>
      <CircleTitleBody circleId={String(id)} mediaId={String(mediaId)} />
    </RequireSession>
  );
}
