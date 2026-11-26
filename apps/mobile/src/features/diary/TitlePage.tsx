import type { LogDto } from "@pausa/api-types";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { diaryApi } from "@/api/diary";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { ErrorState, Heading, Loading, RowList, Screen, Tag, Text } from "@/ui";
import { RequireSession } from "../session";
import { Authors } from "./Authors";
import { ProgressCard } from "./MyDiary";
import { CardList, KindTag, LogCard, num } from "./shared";
import "./diary.messages";

/** My viewings of one title. The API has no filter by title on the diary, so the first pages are read and matched here. */
function useMyLogs(mediaId: string, locale: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; logs: LogDto[]; error?: unknown; complete: boolean }>({ status: "loading", logs: [], complete: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const logs: LogDto[] = [];
      let before: string | null = null;
      for (let i = 0; i < 5; i++) {
        const page = await diaryApi.diary({ before, locale });
        logs.push(...page.items.filter((l) => l.media.id === mediaId));
        if (!page.next) return { logs, complete: true };
        before = page.next;
      }
      return { logs, complete: false };
    })().then(
      (r) => alive && setState({ status: "ready", ...r }),
      (error) => alive && setState({ status: "error", logs: [], error, complete: true }),
    );
    return () => {
      alive = false;
    };
  }, [mediaId, locale, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

function TitleBody({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  const detail = useResource((signal) => diaryApi.media(id, locale, signal), [id, locale]);
  const progress = useResource((signal) => diaryApi.progress(locale, signal), [locale]);
  const mine = useMyLogs(id, locale);
  const back = <BackLink to={href("/diary")} label={t("tabs.diary")} />;
  if (detail.loading && !detail.data)
    return (
      <Screen>
        {back}
        <Loading rows={4} />
      </Screen>
    );
  if (detail.error || !detail.data)
    return (
      <Screen>
        {back}
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </Screen>
    );
  const d = detail.data;
  const year = num(d.media.year);
  const runtime = num(d.runtimeMin);
  const series = d.media.kind === "tv" || d.media.kind === "anime";
  const tracked = progress.data?.find((p) => p.media.id === id);
  return (
    <Screen>
      {back}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <MediaPoster title={d.media.title} path={d.media.posterPath} width={120} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Heading level={1} style={{ fontSize: 40, lineHeight: 44 }}>
            {d.media.title}
          </Heading>
          <Authors authors={d.authors ?? []} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
            {year ? (
              <Text variant="small" tone="muted">
                {year}
              </Text>
            ) : null}
            <KindTag media={d.media} />
            {runtime ? (
              <Text variant="small" tone="muted">
                {runtime >= 60 ? t("media.runtimeLong", { h: Math.floor(runtime / 60), m: runtime % 60 }) : t("media.runtime", { m: runtime })}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {d.genres.map((g) => (
              <Tag key={g} label={g} />
            ))}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("media.logIt")} href={`${href("/log")}?media=${id}`} testID="log-this" />
        <Button label={t("lists.addTo")} variant="secondary" href={`${href("/lists")}?add=${id}`} />
      </View>

      {series && tracked ? (
        <Section title={t("diary.progress.title")}>
          <ProgressCard p={tracked} onChanged={() => void progress.reload()} onGone={() => void progress.reload()} />
        </Section>
      ) : null}

      <Section title={t("media.about")}>
        <Text tone={d.overview ? "ink" : "muted"}>{d.overview ?? t("media.noOverview")}</Text>
      </Section>

      {series && d.seasons.length > 0 ? (
        <Section title={t("diary.title.seasons")}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {d.seasons.map((s) => (
              <Tag key={String(s.season)} label={t("log.seasonOf", { n: num(s.season)!, count: num(s.episodes)! })} />
            ))}
          </View>
        </Section>
      ) : null}

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

      <Section title={t("diary.title.mine")}>
        {mine.status === "loading" ? <Loading rows={1} /> : null}
        {mine.status === "error" ? <ErrorState error={mine.error} onRetry={mine.retry} /> : null}
        {mine.status === "ready" && mine.logs.length === 0 ? <Text tone="muted">{t("diary.title.none")}</Text> : null}
        {mine.logs.length > 0 ? (
          <CardList>
            {mine.logs.map((l) => (
              <LogCard key={l.id} log={l} hideAuthor />
            ))}
          </CardList>
        ) : null}
        {mine.status === "ready" && !mine.complete ? <Text variant="small" tone="muted">{t("diary.title.partial")}</Text> : null}
      </Section>
    </Screen>
  );
}

export function TitlePage() {
  const { mediaId } = useLocalSearchParams<{ mediaId: string }>();
  return (
    <RequireSession>
      <TitleBody id={String(mediaId)} />
    </RequireSession>
  );
}
