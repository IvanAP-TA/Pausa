import type { CountBy } from "@pausa/api-types";
import { View } from "react-native";
import { achievementsApi } from "@/api/achievements";
import { useResource } from "@/api/useResource";
import { useI18n, type MessageKey } from "@/i18n";
import { num } from "@/features/diary/dates";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Screen } from "@/ui/Screen";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Chapter, Meter } from "@/ui/Surfaces";
import { Heading, Text, Title } from "@/ui/Text";
import { starsText } from "@/ui/stars-text";
import { RequireSession } from "../session";
import "./stats.messages";

/** Labelled bars: a row per key, the share of the largest as a meter, the count at the end. */
function Bars({ items, label }: { items: CountBy[]; label: (key: string) => string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...items.map((i) => num(i.count) ?? 0));
  return (
    <View role="list" style={{ gap: space.xs }}>
      {items.map((i) => (
        <View role="listitem" key={i.key} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: hair, borderColor: c.rule, paddingBottom: space["2xs"] }}>
          <Text style={{ width: 120 }} numberOfLines={1}>{label(i.key)}</Text>
          <Meter value={(num(i.count) ?? 0) / max} style={{ flex: 1 }} />
          <Text variant="small" tone="muted" style={{ width: 48, textAlign: "right", fontVariant: ["tabular-nums"] }}>{num(i.count)}</Text>
        </View>
      ))}
    </View>
  );
}

function StatsBody() {
  const { t, href, locale } = useI18n();
  const s = useResource((signal) => achievementsApi.stats(signal), []);
  const d = s.data;
  const n = (v: bigint | number | null | undefined) => num(v ?? null) ?? 0;
  return (
    <Screen>
      <BackLink to={href("/me")} label={t("tabs.profile")} />
      <Heading level={1}>{t("myStats.title")}</Heading>
      {s.loading && !d ? <Loading rows={4} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {d && n(d.viewings) === 0 ? <Empty title={t("myStats.empty")} /> : null}
      {d && n(d.viewings) > 0 ? (
        <>
          <View style={{ gap: space.xs }}>
            <Title style={{ fontSize: 48, lineHeight: 50 }} testID="stats-hours">{t("myStats.hours", { count: Math.floor(n(d.minutes) / 60) })}</Title>
            {n(d.withoutRuntime) > 0 ? <Text variant="small" tone="muted">{t("myStats.hoursFloor", { count: n(d.withoutRuntime) })}</Text> : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs }}>
            <Text variant="strong" testID="stats-viewings">{t("myStats.viewings", { count: n(d.viewings) })}</Text>
            <Text>{t("myStats.films", { count: n(d.films) })}</Text>
            <Text>{t("myStats.series", { count: n(d.series) })}</Text>
            {n(d.episodes) > 0 ? <Text>{t("myStats.episodes", { count: n(d.episodes) })}</Text> : null}
          </View>
          {d.average !== null ? (
            <Text tone="ink2">
              {t("myStats.average", { stars: starsText(d.average, locale) })} · {t("myStats.rated", { count: n(d.rated) })}
            </Text>
          ) : null}
          <Chapter>{t("myStats.genres")}</Chapter>
          {d.genres.length === 0 ? (
            <Text tone="muted">{t("myStats.genresEmpty")}</Text>
          ) : (
            <Bars items={d.genres.slice(0, 10)} label={(k) => t(`profile.genres.${k}` as MessageKey)} />
          )}
          <Chapter>{t("myStats.years")}</Chapter>
          <Bars items={[...d.years].reverse()} label={(k) => k} />
          {d.ratings.length > 0 ? (
            <>
              <Chapter>{t("myStats.ratings")}</Chapter>
              <Bars items={[...d.ratings].reverse()} label={(k) => `${starsText(Number(k), locale)} ★`} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function Stats() {
  return (
    <RequireSession>
      <StatsBody />
    </RequireSession>
  );
}
