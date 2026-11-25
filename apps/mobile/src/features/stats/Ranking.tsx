import type { RankedDto } from "@pausa/api-types";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/api";
import { statsApi, type RankingQuery, type RankingSort } from "@/api/stats";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Sheet } from "@/ui/Sheet";
import { Stars, starsText } from "@/ui/Stars";
import { Toggle } from "@/ui/Toggle";
import { Empty, ErrorState, Heading, Loading, Screen, Tag, Text, Title } from "@/ui";
import { CircleNav, KindTag, num, useCircleScope } from "../diary/shared";
import { RequireSession } from "../session";
import "./stats.messages";

const SORTS: RankingSort[] = ["avg", "votes", "year", "recent", "title"];
type Draft = { q: string; kind: string; yearFrom: string; yearTo: string; minVotes: string; everyone: boolean; by: string };
const EMPTY: Draft = { q: "", kind: "", yearFrom: "", yearTo: "", minVotes: "", everyone: false, by: "" };
const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v) : undefined);

const toQuery = (d: Draft): RankingQuery => ({
  q: d.q.trim() || undefined,
  kind: (d.kind || undefined) as RankingQuery["kind"],
  yearFrom: year(d.yearFrom),
  yearTo: year(d.yearTo),
  minVotes: d.minVotes === "" ? undefined : Number(d.minVotes),
  everyone: d.everyone || undefined,
  by: d.by || undefined,
});

function Entry({ item, position, names }: { item: RankedDto; position: number; names: Map<string, string> }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const y = num(item.media.year);
  const avg = item.avg ? starsText(item.avg, locale) : null;
  return (
    <View testID={`rank-${item.media.id}`} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule }}>
      <Pressable
        role="button"
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={StyleSheet.flatten([{ minHeight: control, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }, web({ cursor: "pointer" })])}
      >
        <Text variant="strong" tone="muted" style={{ width: 32, textAlign: "right" }}>
          {position}
        </Text>
        <MediaPoster title={item.media.title} path={item.media.posterPath} width={44} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
            {item.media.title}
          </Title>
          <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
            {y ? (
              <Text variant="small" tone="muted">
                {y}
              </Text>
            ) : null}
            <KindTag media={item.media} />
            <Text variant="small" tone="muted">
              {t("ranking.votes", { count: item.votes })}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: space["3xs"] }}>
          <Title style={{ fontSize: 26, lineHeight: 28 }} tone={item.avg ? "ink" : "muted"}>
            {avg ?? "–"}
          </Title>
          <Stars halves={item.avg ? Math.round(item.avg) : null} size={12} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingLeft: 32 + space.sm, paddingBottom: space.sm, gap: space.xs }}>
          <Text variant="label" tone="ink2">
            {t("ranking.who")}
          </Text>
          {item.ratings.length === 0 ? (
            <Text variant="small" tone="muted">
              {t("ranking.noRating")}
            </Text>
          ) : (
            item.ratings.map((r) => (
              <View key={r.userId} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ flex: 1 }}>{names.get(r.userId) ?? "?"}</Text>
                <Stars halves={r.rating} size={14} />
              </View>
            ))
          )}
          <Link href={href(`/t/${item.media.id}`) as Href} asChild>
            <Pressable role="link" style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center" }, web({ cursor: "pointer" })])}>
              <Text tone="accent" variant="strong">
                {t("feed.openTitle", { title: item.media.title })}
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </View>
  );
}

function RankingBody({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  useCircleScope(id);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const [sort, setSort] = useState<RankingSort>("avg");
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const query = { ...toQuery(applied), sort, page };
  const rank = useResource((signal) => statsApi.ranking(id, { ...query, locale }, signal), [id, locale, JSON.stringify(query)]);
  const names = new Map((circle.data?.members ?? []).map((m) => [m.userId, m.name]));
  const filtered = Object.values(toQuery(applied)).filter((v) => v !== undefined).length;
  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const pages = rank.data ? Math.max(1, Math.ceil(rank.data.total / rank.data.pageSize)) : 1;

  return (
    <Screen>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <Heading level={1}>{circle.data?.name ?? t("ranking.title")}</Heading>
      <CircleNav circleId={id} current="ranking" />
      <Text tone="ink2">{t("ranking.lede")}</Text>
      <Choice<RankingSort> label={t("ranking.filters.sort")} value={sort} onChange={(s) => { setSort(s); setPage(0); }} options={SORTS.map((s) => ({ value: s, label: t(`ranking.sort.${s}`) }))} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Button label={t("ranking.filters.title")} variant="secondary" testID="open-filters" onPress={() => { setDraft(applied); setOpen(true); }} />
        {filtered > 0 ? <Tag tone="accent" label={t("diary.feed.active", { count: filtered })} /> : null}
        {filtered > 0 ? <Button label={t("ranking.filters.reset")} variant="quiet" onPress={() => { setApplied(EMPTY); setPage(0); }} /> : null}
      </View>

      {rank.loading && !rank.data ? <Loading rows={5} /> : null}
      {rank.error ? <ErrorState error={rank.error} onRetry={rank.reload} /> : null}
      {rank.data ? (
        <>
          <Text variant="small" tone="muted" role="status" aria-live="polite">
            {t("ranking.count", { count: rank.data.total })}
          </Text>
          {rank.data.items.length === 0 ? (
            <Empty title={filtered > 0 ? t("ranking.empty") : t("ranking.emptyAll")}>
              {filtered > 0 ? <Button label={t("ranking.filters.reset")} variant="secondary" onPress={() => setApplied(EMPTY)} /> : <Button label={t("feed.emptyCta")} href={href("/log")} />}
            </Empty>
          ) : (
            <View role="list" style={{ borderTopWidth: hair, borderColor: "transparent" }}>
              {rank.data.items.map((item, i) => (
                <Entry key={item.media.id} item={item} position={rank.data!.page * rank.data!.pageSize + i + 1} names={names} />
              ))}
            </View>
          )}
          {pages > 1 ? (
            <View role="navigation" aria-label={t("ranking.pages")} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Button label={t("ranking.prev")} variant="secondary" disabled={page <= 0} onPress={() => setPage((p) => p - 1)} testID="prev-page" />
              <Text role="status" aria-live="polite">
                {t("stats.ranking.pageOf", { page: page + 1, pages })}
              </Text>
              <Button label={t("ranking.next")} variant="secondary" disabled={page >= pages - 1} onPress={() => setPage((p) => p + 1)} testID="next-page" />
            </View>
          ) : null}
        </>
      ) : null}

      <Sheet title={t("ranking.filters.title")} open={open} onClose={() => setOpen(false)}>
        <Field label={t("ranking.filters.q")} value={draft.q} onChangeText={set("q")} autoCorrect={false} testID="rank-q" />
        <Choice label={t("ranking.filters.kind")} value={draft.kind} onChange={set("kind")} options={[{ value: "", label: t("ranking.filters.any") }, { value: "movie", label: t("kind.movie") }, { value: "tv", label: t("kind.tv") }, { value: "anime", label: t("kind.anime") }]} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label={t("ranking.filters.from")} value={draft.yearFrom} onChangeText={set("yearFrom")} keyboardType="number-pad" maxLength={4} hint={rank.data?.yearMin ? String(num(rank.data.yearMin)) : undefined} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("ranking.filters.to")} value={draft.yearTo} onChangeText={set("yearTo")} keyboardType="number-pad" maxLength={4} hint={rank.data?.yearMax ? String(num(rank.data.yearMax)) : undefined} />
          </View>
        </View>
        <Choice label={t("ranking.filters.votes")} value={draft.minVotes} onChange={set("minVotes")} options={[{ value: "", label: t("stats.ranking.defaultVotes") }, { value: "0", label: t("ranking.filters.anyVotes") }, { value: "2", label: t("ranking.filters.atLeast", { count: 2 }) }, { value: "3", label: t("ranking.filters.atLeast", { count: 3 }) }]} />
        <Toggle label={t("ranking.filters.everyoneSaw")} value={draft.everyone} onChange={set("everyone")} />
        {circle.data ? <Choice label={t("ranking.filters.by")} value={draft.by} onChange={set("by")} options={[{ value: "", label: t("ranking.filters.everyone") }, ...circle.data.members.map((m) => ({ value: m.userId, label: m.name }))]} /> : null}
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={t("ranking.filters.apply")} testID="apply-filters" onPress={() => { setApplied(draft); setPage(0); setOpen(false); }} />
          <Button label={t("ranking.filters.reset")} variant="quiet" onPress={() => setDraft(EMPTY)} />
        </View>
      </Sheet>
    </Screen>
  );
}

export function Ranking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <RankingBody id={String(id)} />
    </RequireSession>
  );
}
