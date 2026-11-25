import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { diaryApi, type FeedFilters } from "@/api/diary";
import { usePages } from "@/api/usePages";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Field } from "@/ui/Field";
import { Sheet } from "@/ui/Sheet";
import { Empty, ErrorState, Loading, Heading, RowList, Screen, Tag, Text } from "@/ui";
import { RequireSession } from "../session";
import { CircleNav, LogCard, useCircleScope } from "./shared";
import "./diary.messages";

type Draft = { person: string; kind: string; year: string; platform: string; minRating: string };
const EMPTY: Draft = { person: "", kind: "", year: "", platform: "", minRating: "" };

const toFilters = (d: Draft): FeedFilters => ({
  person: d.person || undefined,
  kind: (d.kind || undefined) as FeedFilters["kind"],
  year: /^\d{4}$/.test(d.year.trim()) ? Number(d.year) : undefined,
  platform: d.platform.trim() || undefined,
  minRating: d.minRating ? Number(d.minRating) : undefined,
});

function FeedBody({ id, person }: { id: string; person?: string }) {
  const { t, href, locale } = useI18n();
  useCircleScope(id);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const [applied, setApplied] = useState<Draft>({ ...EMPTY, person: person ?? "" });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const filters = toFilters(applied);
  const feed = usePages((before, signal) => diaryApi.feed(id, { ...filters, before, locale }, signal), [id, locale, JSON.stringify(filters)]);
  const activeCount = Object.values(filters).filter((v) => v !== undefined).length;
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Screen onRefresh={() => void feed.reload()} refreshing={feed.status === "loading" && feed.items.length > 0} onNearEnd={() => void feed.loadMore()}>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <Heading level={1}>{circle.data?.name ?? t("diary.nav.feed")}</Heading>
      <CircleNav circleId={id} current="feed" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Button
          label={t("feed.filter.title")}
          variant="secondary"
          onPress={() => {
            setDraft(applied);
            setOpen(true);
          }}
          testID="open-filters"
        />
        <Button label={t("diary.feed.refresh")} variant="quiet" onPress={() => void feed.reload()} />
        {activeCount > 0 ? <Tag tone="accent" label={t("diary.feed.active", { count: activeCount })} /> : null}
        {activeCount > 0 ? <Button label={t("feed.filter.clear")} variant="quiet" onPress={() => setApplied(EMPTY)} /> : null}
      </View>

      {feed.status === "loading" ? <Loading rows={4} /> : null}
      {feed.status === "error" ? <ErrorState error={feed.error} onRetry={feed.reload} /> : null}
      {feed.status === "ready" && feed.items.length === 0 ? (
        activeCount > 0 ? (
          <Empty title={t("feed.filter.none")} body={t("diary.feed.noneBody")}>
            <Button label={t("feed.filter.clear")} variant="secondary" onPress={() => setApplied(EMPTY)} />
          </Empty>
        ) : (
          <Empty title={t("feed.emptyTitle")} body={t("feed.emptyBody")}>
            <Button label={t("feed.emptyCta")} href={href("/log")} />
          </Empty>
        )
      ) : null}
      {feed.items.length > 0 ? (
        <RowList>
          {feed.items.map((log) => (
            <LogCard key={log.id} log={log} circleId={id} />
          ))}
        </RowList>
      ) : null}
      {feed.more === "loading" ? <Loading rows={1} /> : null}
      {feed.more === "error" ? (
        <View role="alert" style={{ gap: space.xs }}>
          <Text tone="error">{errorMessage(t, feed.moreError)}</Text>
          <Button label={t("errors.retry")} variant="secondary" onPress={() => void feed.loadMore()} />
        </View>
      ) : null}
      {feed.next && feed.more === "idle" ? <Button label={t("diary.feed.more")} variant="secondary" onPress={() => void feed.loadMore()} testID="load-more" /> : null}
      {feed.status === "ready" && feed.items.length > 0 && !feed.next ? (
        <Text variant="small" tone="muted">
          {t("feed.endOfFeed")}
        </Text>
      ) : null}

      <Sheet title={t("feed.filter.title")} open={open} onClose={() => setOpen(false)}>
        {circle.data ? (
          <Choice
            label={t("feed.filter.by")}
            value={draft.person}
            onChange={set("person")}
            options={[{ value: "", label: t("feed.filter.everyone") }, ...circle.data.members.map((m) => ({ value: m.userId, label: m.name }))]}
          />
        ) : null}
        <Choice
          label={t("feed.filter.kind")}
          value={draft.kind}
          onChange={set("kind")}
          options={[
            { value: "", label: t("feed.filter.any") },
            { value: "movie", label: t("kind.movie") },
            { value: "tv", label: t("kind.tv") },
            { value: "anime", label: t("kind.anime") },
          ]}
        />
        <Field label={t("feed.filter.year")} value={draft.year} onChangeText={set("year")} keyboardType="number-pad" maxLength={4} hint={t("diary.feed.yearHint")} />
        <Field label={t("log.platform")} value={draft.platform} onChangeText={set("platform")} placeholder={t("log.platformPlaceholder")} maxLength={60} />
        <Choice
          label={t("feed.filter.rating")}
          value={draft.minRating}
          onChange={set("minRating")}
          options={[
            { value: "", label: t("feed.filter.any") },
            ...[6, 8, 9].map((h) => ({ value: String(h), label: t("feed.filter.atLeast", { stars: h / 2 }) })),
          ]}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          <Button
            label={t("feed.filter.apply")}
            onPress={() => {
              setApplied(draft);
              setOpen(false);
            }}
            testID="apply-filters"
          />
          <Button label={t("feed.filter.clear")} variant="quiet" onPress={() => setDraft(EMPTY)} />
        </View>
      </Sheet>
    </Screen>
  );
}

export function Feed() {
  const { id, person } = useLocalSearchParams<{ id: string; person?: string }>();
  return (
    <RequireSession>
      <FeedBody id={String(id)} person={person ? String(person) : undefined} />
    </RequireSession>
  );
}
