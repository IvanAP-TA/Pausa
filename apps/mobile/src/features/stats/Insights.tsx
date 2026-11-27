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
import { control, hair, space, useTheme } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Meter, Well } from "@/ui/Surfaces";
import { Stars, starsText } from "@/ui/Stars";
import { Empty, ErrorState, Heading, Loading, Notice, Screen, Text, Title } from "@/ui";
import { useCircleScope } from "../diary/shared";
import { RequireSession } from "../session";
import "./stats.messages";
import { shareYearCard } from "./year-card";
import type { YearCard } from "./year-card-types";
import { listFormat } from "@/i18n/intl";

/** Month name from `2026-03`, in the person's language. */
const monthName = (key: string, locale: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(y, (m ?? 1) - 1, 1));
};

function Stat({ value, label, first }: { value: string; label: string; first?: boolean }) {
  const { c } = useTheme();
  return (
    // A group named "12 visioni" (a bare View with an aria-label is what axe refuses: aria-prohibited-attr); the two texts inside are hidden so it is read once.
    <View
      role="group"
      aria-label={`${value} ${label}`}
      style={{ minWidth: 120, flexGrow: 1, flexBasis: 120, gap: space["3xs"], paddingLeft: first ? 0 : space.md, borderLeftWidth: first ? 0 : hair, borderColor: c.rule }}
    >
      <Title aria-hidden style={{ fontSize: 64, lineHeight: 64 }}>
        {value}
      </Title>
      <Text aria-hidden variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const kindLabel = (t: (k: never, v?: never) => string, kind: string) => t((kind === "movie" ? "kind.movie" : kind === "anime" ? "kind.anime" : "kind.tv") as never);

/** A title with its poster, the average and, when `names` is given, each person's own stars (agree / split lists). */
function TitleRow({ item, names }: { item: RankedDto; names?: Map<string, string> }) {
  const { t, locale } = useI18n();
  const avg = item.avg ? starsText(item.avg, locale) : null;
  return (
    <View testID={`verdict-${item.media.id}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: space.sm }}>
      <MediaPoster title={item.media.title} path={item.media.posterPath} width={56} />
      <View style={{ flex: 1, gap: space.xs, minWidth: 0 }}>
        <Title numberOfLines={3} style={{ fontSize: 22, lineHeight: 24 }}>
          {item.media.title}
        </Title>
        {names ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space["2xs"] }}>
            {item.ratings.map((r) => (
              <View key={r.userId} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Text variant="small" tone="ink2">
                  {names.get(r.userId) ?? "?"}
                </Text>
                <Stars halves={r.rating} size={13} />
              </View>
            ))}
          </View>
        ) : (
          <Text variant="small" tone="muted">
            {t("insights.raters", { count: item.votes })}
          </Text>
        )}
      </View>
      {avg && !names ? (
        <View style={{ alignItems: "flex-end" }}>
          <Title style={{ fontSize: 24, lineHeight: 26 }}>{avg}</Title>
          <Stars halves={Math.round(item.avg!)} size={12} />
        </View>
      ) : null}
    </View>
  );
}

function Pair({ p }: { p: PairDto }) {
  const { t, locale } = useI18n();
  const pct = p.score === null ? null : new Intl.NumberFormat(locale, { style: "percent" }).format(p.score);
  return (
    <View testID="pair" style={{ gap: space.xs, paddingVertical: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
        <Avatar name={p.a.name} image={p.a.image} size={32} />
        <Avatar name={p.b.name} image={p.b.image} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
            {p.a.name} · {p.b.name}
          </Title>
          <Text variant="small" tone="muted">
            {pct === null ? t("insights.taste.needMore", { count: p.common, min: 3 }) : t("insights.taste.onTitles", { count: p.common })}
          </Text>
        </View>
        <Title role="img" style={{ fontSize: 40, lineHeight: 40 }} tone={pct === null ? "muted" : "ink"} aria-label={pct ?? t("insights.taste.unknown")}>
          {pct ?? "–"}
        </Title>
      </View>
      <Meter value={p.score ?? 0} />
    </View>
  );
}

/** "Per te": what to watch next from what *I* rated highest (TMDB), with the credit line. */
function ForYouSection({ circleId }: { circleId: string }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const mine = useResource((signal) => statsApi.forYou({ locale }, signal), [locale]);
  const list = (names: string[]) => listFormat(locale, names);
  return (
    <Section title={t("discover.title")} lede={t("discover.body")}>
      {mine.loading && !mine.data ? <Loading rows={2} /> : null}
      {mine.error ? <ErrorState error={mine.error} onRetry={mine.reload} /> : null}
      {mine.data && !mine.data.enabled ? <Text tone="ink2">{t("discover.off")}</Text> : null}
      {mine.data?.enabled && mine.data.picks.length === 0 ? <Text tone="ink2">{t("discover.empty")}</Text> : null}
      {mine.data?.enabled
        ? mine.data.picks.map((p) => (
            <View key={p.key} testID={`foryou-${p.key}`} style={{ flexDirection: "row", gap: space.md, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
              <MediaPoster title={p.title} path={p.posterPath} width={96} />
              <View style={{ flex: 1, gap: space["2xs"], minWidth: 0 }}>
                <Title numberOfLines={3} style={{ fontSize: 26, lineHeight: 28 }}>
                  {p.title}
                </Title>
                <Text variant="small" tone="muted">
                  {[kindLabel(t, p.kind), p.year].filter(Boolean).join(", ")}
                </Text>
                <Text>{t("discover.because", { titles: list(p.because.map((b) => b.title)) })}</Text>
                <Button label={t("discover.log")} accessibilityLabel={`${t("discover.log")}: ${p.title}`} variant="quiet" href={`${href("/log")}?pick=${encodeURIComponent(p.key)}&title=${encodeURIComponent(p.title)}&kind=${p.kind}${p.year ? `&year=${p.year}` : ""}${p.posterPath ? `&poster=${encodeURIComponent(p.posterPath)}` : ""}&circle=${circleId}`} />
              </View>
            </View>
          ))
        : null}
      <Text variant="small" tone="muted">
        {t("discover.credit")}
      </Text>
    </Section>
  );
}

function Recs({ circleId }: { circleId: string }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const recs = useResource((signal) => statsApi.recommendations(circleId, { limit: 6, locale }, signal), [circleId, locale]);
  const list = (names: string[]) => listFormat(locale, names);
  return (
    <Section title={t("insights.recs.title")} lede={t("insights.recs.body")}>
      {recs.loading && !recs.data ? <Loading rows={2} /> : null}
      {recs.error ? <ErrorState error={recs.error} onRetry={recs.reload} /> : null}
      {recs.data && recs.data.length === 0 ? <Empty title={t("insights.recs.empty")} /> : null}
      {recs.data?.map((r: Recommendation) => (
        <View key={r.media.id} testID={`rec-${r.media.id}`} style={{ flexDirection: "row", gap: space.md, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
          <MediaPoster title={r.media.title} path={r.media.posterPath} width={96} />
          <View style={{ flex: 1, gap: space["2xs"], minWidth: 0 }}>
            <Title numberOfLines={3} style={{ fontSize: 26, lineHeight: 28 }}>
              {r.media.title}
            </Title>
            <Text variant="small" tone="muted">
              {[kindLabel(t, r.media.kind), r.media.year].filter(Boolean).join(", ")}
            </Text>
            {r.lovedBy.length > 0 ? <Text>{t("insights.recs.lovedBy", { names: list(r.lovedBy.map((l) => l.person.name)) })}</Text> : null}
            <Text variant="small" tone="ink2">
              {t("insights.recs.unseenBy", { names: list(r.unseenBy.map((p) => p.name)) })}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
              <Text variant="small" tone="muted">
                {t("insights.recs.forecast")}
              </Text>
              <Stars halves={Math.round(r.score)} size={16} />
              <Text variant="small" tone="muted">
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(r.score / 2)} / 5
              </Text>
            </View>
            <Button label={t("media.logIt")} accessibilityLabel={`${t("media.logIt")}: ${r.media.title}`} variant="quiet" href={`${href("/log")}?media=${r.media.id}&circle=${circleId}`} />
          </View>
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
  const { c } = useTheme();
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
  const kinds = [
    [y.movies, "movie"],
    [y.series, "tv"],
    [y.anime, "anime"],
  ] as const;
  const facts = [
    y.mostActive ? t("insights.facts.mostActive", { name: y.mostActive.person.name, count: y.mostActive.count }) : null,
    ...extra,
    y.togetherMost ? t("insights.facts.together", { a: y.togetherMost.a.name, b: y.togetherMost.b.name, count: y.togetherMost.times }) : null,
    listFormat(locale, kinds.filter(([n]) => n > 0).map(([n, k]) => `${n} ${t(`kind.${k}`).toLowerCase()}`)),
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
      <Well grained style={{ padding: space.md }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.lg, columnGap: space.md }} testID="year-stats">
          <Stat first value={String(y.logs)} label={t("insights.stats.logs", { count: y.logs })} />
          <Stat value={String(y.titles)} label={t("insights.stats.titles")} />
          <Stat value={String(hours)} label={t("insights.stats.hours")} />
          {y.avgStars ? <Stat value={new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(y.avgStars)} label={t("insights.stats.avg")} /> : null}
        </View>
      </Well>
      {y.titleOfTheYear ? (
        <View testID="title-of-year" style={{ flexDirection: "row", gap: space.md, paddingTop: space.md, borderTopWidth: hair, borderColor: c.rule }}>
          <MediaPoster title={y.titleOfTheYear.media.title} path={y.titleOfTheYear.media.posterPath} width={104} />
          <View style={{ flex: 1, gap: space.xs, minWidth: 0 }}>
            <Title numberOfLines={3} style={{ fontSize: 28, lineHeight: 30 }}>
              {y.titleOfTheYear.media.title}
            </Title>
            <Text variant="small" tone="muted">
              {t("insights.titleOfYear")}
            </Text>
            {y.titleOfTheYear.avg ? <Stars halves={Math.round(y.titleOfTheYear.avg)} size={20} /> : null}
            <Text variant="small" tone="muted">
              {t("insights.raters", { count: y.titleOfTheYear.votes })}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ borderTopWidth: hair, borderColor: c.rule }}>
        {facts.map((f) => (
          <View key={f} style={{ minHeight: control, justifyContent: "center", paddingVertical: space.xs, borderBottomWidth: hair, borderColor: c.rule }}>
            <Text tone="ink2">{f}</Text>
          </View>
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
  const names = new Map((circle.data?.members ?? []).map((m) => [m.userId, m.name]));
  return (
    <Screen>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <Heading level={1}>{circle.data?.name ?? t("insights.title")}</Heading>
      {data.loading && !data.data ? <Loading rows={4} /> : null}
      {data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : null}
      {data.data ? (
        <>
          <Section title={t("insights.yearTitle", { year: shown ?? "" })} first>
            {years.length > 1 ? <Choice label={t("insights.yearLabel")} value={String(shown)} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} /> : null}
            <YearInReview data={data.data} year={shown ?? new Date().getFullYear()} />
          </Section>
          {data.data.pairs.length > 0 ? (
            <Section title={t("insights.taste.title")} lede={t("insights.taste.body", { min: 3 })}>
              {data.data.pairs.map((p) => (
                <Pair key={`${p.a.id}-${p.b.id}`} p={p} />
              ))}
            </Section>
          ) : null}
          <Section title={t("insights.agree.title")}>
            {data.data.agree.length === 0 ? <Text tone="muted">{t("stats.insights.noneYet")}</Text> : data.data.agree.map((r) => <TitleRow key={r.media.id} item={r} names={names} />)}
          </Section>
          <Section title={t("insights.split.title")}>
            {data.data.split.length === 0 ? <Text tone="muted">{t("stats.insights.noneYet")}</Text> : data.data.split.map((r) => <TitleRow key={r.media.id} item={r} names={names} />)}
          </Section>
          <ForYouSection circleId={id} />
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
