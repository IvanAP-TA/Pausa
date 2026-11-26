import type { LogDto } from "@pausa/api-types";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { usePages } from "@/api/usePages";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Empty, ErrorState, Loading, Screen, Text } from "@/ui";
import { DayHead } from "@/ui/Surfaces";
import { RequireSession, useSession } from "../session";
import { CircleExtrasView, CircleHead, OnAir } from "./CircleHead";
import { EMPTY, FilterBar, toFilters, type Draft } from "./FilterBar";
import { dayKey, dayName } from "./dates";
import { CardList, LogCard, useCircleScope } from "./shared";
import "./diary.messages";

/**
 * v1: the diary is cut into days (of the app's time zone, by when a viewing reached the Cerchia). Each day opens with its date set
 * as a figure on an ink rule, the weekday (or oggi, ieri) and the month beside it; today's figure takes the signal.
 */
function Days({ items, circleId }: { items: LogDto[]; circleId: string }) {
  const { locale } = useI18n();
  const now = Date.now();
  const groups: Array<{ key: string; at: number; logs: LogDto[] }> = [];
  for (const log of items) {
    const key = dayKey(log.arrivedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.logs.push(log);
    else groups.push({ key, at: log.arrivedAt, logs: [log] });
  }
  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  return (
    <View testID="days">
      {groups.map((g, i) => (
        <View key={g.key} style={{ marginTop: i === 0 ? 0 : space.xl - 8 }} testID={`day-${g.key}`}>
          <DayHead day={new Date(g.at).getDate()} name={dayName(g.at, now, locale)} month={month.format(g.at)} today={g.key === dayKey(now)} />
          <CardList>
            {g.logs.map((log) => (
              <LogCard key={log.id} log={log} circleId={circleId} />
            ))}
          </CardList>
        </View>
      ))}
    </View>
  );
}

function FeedBody({ id, person }: { id: string; person?: string }) {
  const { t, href, locale } = useI18n();
  const { state } = useSession();
  useCircleScope(id);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const extras = useResource((signal) => diaryApi.extras(id, locale, signal), [id, locale]);
  const [applied, setApplied] = useState<Draft>({ ...EMPTY, person: person ?? "" });
  const filters = toFilters(applied);
  const feed = usePages((before, signal) => diaryApi.feed(id, { ...filters, before, locale }, signal), [id, locale, JSON.stringify(filters)]);
  const activeCount = Object.values(filters).filter((v) => v !== undefined).length;

  // Not mine (any more) or gone: one message, not a second one from the feed under it.
  if (circle.error)
    return (
      <Screen>
        <ErrorState error={circle.error} onRetry={circle.reload} />
      </Screen>
    );

  return (
    <Screen onRefresh={() => { void feed.reload(); circle.reload(); extras.reload(); }} refreshing={feed.status === "loading" && feed.items.length > 0} onNearEnd={() => void feed.loadMore()}>
      {circle.data ? <CircleHead circle={circle.data} /> : <Loading rows={1} />}
      {circle.data ? <OnAir watching={circle.data.watching} meId={state.status === "ready" ? state.me.id : undefined} onChanged={() => void circle.reload()} /> : null}
      <FilterBar
        members={circle.data?.members ?? []}
        applied={applied}
        onApply={setApplied}
        resultCount={activeCount > 0 && feed.status === "ready" ? feed.items.length : null}
        hasMore={!!feed.next}
      />

      {/* v1: first steps and memories only on the plain diary, not on a filtered view. */}
      {activeCount === 0 ? <CircleExtrasView circleId={id} extras={extras.data} /> : null}

      {feed.status === "loading" ? <Loading rows={4} /> : null}
      {feed.status === "error" ? <ErrorState error={feed.error} onRetry={feed.reload} /> : null}
      {feed.status === "ready" && feed.items.length === 0 ? (
        activeCount > 0 ? (
          <Text tone="ink2" style={{ paddingTop: space.md }} testID="filter-none">
            {t("feed.filter.none")}
          </Text>
        ) : (
          <Empty title={t("feed.emptyTitle")} body={t("feed.emptyBody")}>
            <Button label={t("feed.emptyCta")} href={href("/log")} />
          </Empty>
        )
      ) : null}
      {feed.items.length > 0 ? <Days items={feed.items} circleId={id} /> : null}
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
