import type { Insights as InsightsDto, PairDto, RankedDto, Recommendation } from "@pausa/api-types";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState, type RefObject } from "react";
import { View, type HostInstance } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { statsApi } from "@/api/stats";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Stars, starsText } from "@/ui/Stars";
import { Empty, ErrorState, Heading, Loading, Notice, Screen, Text, Title } from "@/ui";
import { CircleNav, useCircleScope } from "../diary/shared";
import { RequireSession } from "../session";
import "./stats.messages";
import { shareYearCard } from "./year-card";
import type { YearCard } from "./year-card-types";

/** Month name from `2026-03`, in the person's language. */
const monthName = (key: string, locale: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(y, (m ?? 1) - 1, 1));
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    // A group named "12 visioni" (a bare View with an aria-label is what axe refuses: aria-prohibited-attr); the two texts inside are hidden so it is read once.
    <View role="group" aria-label={`${value} ${label}`} style={{ minWidth: 96, gap: space["3xs"] }}>
      <Title aria-hidden style={{ fontSize: 40, lineHeight: 42 }}>
        {value}
      </Title>
      <Text aria-hidden variant="small" tone="ink2">
        {label}
      </Text>
    </View>
  );
}

function TitleRow({ item, note }: { item: RankedDto; note?: string }) {
  const { t, locale } = useI18n();
  const avg = item.avg ? starsText(item.avg, locale) : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }}>
      <MediaPoster title={item.media.title} path={item.media.posterPath} width={40} />
      <View style={{ flex: 1, gap: space["3xs"] }}>
        <Text variant="strong" numberOfLines={2}>
          {item.media.title}
        </Text>
        <Text variant="small" tone="muted">
          {note ?? t("insights.raters", { count: item.votes })}
        </Text>
      </View>
      {avg ? (
        <View style={{ alignItems: "flex-end" }}>
          <Title style={{ fontSize: 24, lineHeight: 26 }}>{avg}</Title>
          <Stars halves={Math.round(item.avg!)} size={12} />
        </View>
      ) : null}
    </View>
  );
}

function Pair({ p }: { p: PairDto }) {
  const { t } = useI18n();
  const pct = p.score === null ? null : Math.round(p.score * 100);
  return (
    <View testID="pair" style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }}>
      <Avatar name={p.a.name} image={p.a.image} size={32} />
      <Avatar name={p.b.name} image={p.b.image} size={32} />
      <View style={{ flex: 1 }}>
        <Text variant="strong">
          {p.a.name} · {p.b.name}
        </Text>
        <Text variant="small" tone="muted">
          {pct === null ? t("insights.taste.needMore", { count: p.common, min: 3 }) : t("insights.taste.onTitles", { count: p.common })}
        </Text>
      </View>
      <Title role="img" style={{ fontSize: 30, lineHeight: 32 }} tone={pct === null ? "muted" : "ink"} aria-label={pct === null ? t("insights.taste.unknown") : `${pct}%`}>
        {pct === null ? "–" : `${pct}%`}
      </Title>
    </View>
  );
}

function Recs({ circleId }: { circleId: string }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const recs = useResource((signal) => statsApi.recommendations(circleId, { limit: 12, locale }, signal), [circleId, locale]);
  return (
    <Section title={t("insights.recs.title")} lede={t("insights.recs.body")}>
      {recs.loading && !recs.data ? <Loading rows={2} /> : null}
      {recs.error ? <ErrorState error={recs.error} onRetry={recs.reload} /> : null}
      {recs.data && recs.data.length === 0 ? <Empty title={t("insights.recs.empty")} /> : null}
      {recs.data?.map((r: Recommendation) => (
        <View key={r.media.id} testID={`rec-${r.media.id}`} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }}>
          <MediaPoster title={r.media.title} path={r.media.posterPath} width={52} />
          <View style={{ flex: 1, gap: space["2xs"] }}>
            <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
              {r.media.title}
            </Title>
            <Text variant="small" tone="ink2">
              {t("insights.recs.unseenBy", { names: r.unseenBy.map((p) => p.name).join(", ") })}
            </Text>
            {r.lovedBy.length > 0 ? (
              <Text variant="small" tone="ink2">
                {t("insights.recs.lovedBy", { names: r.lovedBy.map((l) => `${l.person.name} (${starsText(l.rating, locale)})`).join(", ") })}
              </Text>
            ) : null}
            <Text variant="small" tone="muted">
              {t("insights.recs.forecast")}: {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(r.score / 2)} / 5
            </Text>
          </View>
          <Button label={t("media.logIt")} accessibilityLabel={`${t("media.logIt")}: ${r.media.title}`} variant="quiet" href={`${href("/log")}?media=${r.media.id}&circle=${circleId}`} />
        </View>
      ))}
    </Section>
  );
}

/** The card as it looks on screen; on native this very view is captured to a PNG. */
function YearCardPreview({ card, innerRef }: { card: YearCard; innerRef: RefObject<HostInstance | null> }) {
  const { c } = useTheme();
  return (
    <View ref={innerRef} collapsable={false} testID="year-card" style={{ backgroundColor: c.paper, borderWidth: hair, borderColor: c.rule, padding: space.lg, gap: space.sm }}>
      <View style={{ width: 64, height: 4, backgroundColor: c.accent }} />
      <Text variant="label" tone="ink2" style={{ textTransform: "uppercase" }}>
        {card.kicker}
      </Text>
      <Heading level={1} style={{ fontSize: 56, lineHeight: 60 }}>
        {card.headline}
      </Heading>
      {card.stats.map((s) => (
        <Title key={s} style={{ fontSize: 24, lineHeight: 26 }}>
          {s}
        </Title>
      ))}
      {card.best ? (
        <View>
          <Text variant="label" tone="accent" style={{ textTransform: "uppercase" }}>
            {card.best.label}
          </Text>
          <Title style={{ fontSize: 30, lineHeight: 32 }}>{card.best.title}</Title>
        </View>
      ) : null}
      {card.extra.map((e) => (
        <Text key={e} variant="small" tone="ink2">
          {e}
        </Text>
      ))}
      <Title tone="accent">{card.brand}</Title>
    </View>
  );
}

function YearInReview({ data, year }: { data: InsightsDto; year: number }) {
  const { t, locale } = useI18n();
  const y = data.year;
  const view = useRef<HostInstance>(null);
  const share = useAction();
  const [outcome, setOutcome] = useState<string | null>(null);
  if (y.logs === 0) return <Empty title={t("insights.yearEmpty", { year })} />;
  const hours = Math.round(y.movieHours);
  const extra = [
    y.busiestMonth ? t("insights.facts.busiest", { month: monthName(y.busiestMonth.key, locale), count: y.busiestMonth.count }) : null,
    y.topPlatform ? t("insights.facts.platform", { name: y.topPlatform.key }) : null,
  ].filter((x): x is string => !!x);
  const card: YearCard = {
    kicker: t("insights.yearCard.kicker", { year }),
    headline: t("insights.yearCard.logs", { count: y.logs }),
    stats: [t("insights.yearCard.titles", { count: y.titles }), ...(hours > 0 ? [t("insights.yearCard.hours", { count: hours })] : []), ...(y.avgStars ? [t("insights.yearCard.avg", { stars: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(y.avgStars) })] : [])],
    best: y.titleOfTheYear ? { label: t("insights.yearCard.best"), title: y.titleOfTheYear.media.title } : null,
    extra,
    brand: "Pausa",
    fileName: `pausa-${year}.png`,
    shareText: t("insights.yearCard.shareText", { year }),
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }} testID="year-stats">
        <Stat value={String(y.logs)} label={t("insights.stats.logs", { count: y.logs })} />
        <Stat value={String(y.titles)} label={t("insights.stats.titles")} />
        <Stat value={String(hours)} label={t("insights.stats.hours")} />
        {y.avgStars ? <Stat value={new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(y.avgStars)} label={t("insights.stats.avg")} /> : null}
      </View>
      {y.titleOfTheYear ? (
        <View>
          <Text variant="label" tone="ink2">
            {t("insights.titleOfYear")}
          </Text>
          <TitleRow item={y.titleOfTheYear} />
        </View>
      ) : null}
      <View style={{ gap: space["2xs"] }}>
        {y.mostActive ? <Text>{t("insights.facts.mostActive", { name: y.mostActive.person.name, count: y.mostActive.count })}</Text> : null}
        {extra.map((e) => (
          <Text key={e}>{e}</Text>
        ))}
      </View>
      <YearCardPreview card={card} innerRef={view} />
      <Button
        label={share.busy ? t("insights.yearCard.preparing") : t("insights.yearCard.share")}
        busy={share.busy}
        testID="share-year"
        onPress={async () => {
          setOutcome(null);
          const res = await share.run(() => shareYearCard(card, view));
          if (res) setOutcome(res.value === "saved" ? t("stats.insights.saved") : t("stats.insights.shared"));
        }}
      />
      {outcome ? <Notice>{outcome}</Notice> : null}
      {share.error ? (
        <Text tone="error" role="alert">
          {t("insights.yearCard.failed")} {errorMessage(t, share.error)}
        </Text>
      ) : null}
    </View>
  );
}

function InsightsBody({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  useCircleScope(id);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const [year, setYear] = useState<number | undefined>(undefined);
  const data = useResource((signal) => statsApi.insights(id, { year, locale }, signal), [id, year, locale]);
  const years = (data.data?.yearsWithLogs ?? []).map((y) => Number(y)).sort((a, b) => b - a);
  const shown = data.data ? Number(data.data.year.year) : year;
  return (
    <Screen>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <Heading level={1}>{circle.data?.name ?? t("insights.title")}</Heading>
      <CircleNav circleId={id} current="insights" />
      {data.loading && !data.data ? <Loading rows={4} /> : null}
      {data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : null}
      {data.data ? (
        <>
          <Section title={t("insights.yearTitle", { year: shown ?? "" })} first>
            {years.length > 1 ? <Choice label={t("insights.yearLabel")} value={String(shown)} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} /> : null}
            <YearInReview data={data.data} year={shown ?? new Date().getFullYear()} />
          </Section>
          <Section title={t("insights.agree.title")}>
            {data.data.agree.length === 0 ? <Text tone="muted">{t("stats.insights.noneYet")}</Text> : data.data.agree.map((r) => <TitleRow key={r.media.id} item={r} />)}
          </Section>
          <Section title={t("insights.split.title")}>
            {data.data.split.length === 0 ? <Text tone="muted">{t("stats.insights.noneYet")}</Text> : data.data.split.map((r) => <TitleRow key={r.media.id} item={r} />)}
          </Section>
          <Section title={t("insights.taste.title")} lede={t("insights.taste.body", { min: 3 })}>
            {data.data.pairs.length === 0 ? <Text tone="muted">{t("insights.taste.unknown")}</Text> : data.data.pairs.map((p) => <Pair key={`${p.a.id}-${p.b.id}`} p={p} />)}
          </Section>
          <Recs circleId={id} />
        </>
      ) : null}
    </Screen>
  );
}

export function Insights() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <InsightsBody id={String(id)} />
    </RequireSession>
  );
}
