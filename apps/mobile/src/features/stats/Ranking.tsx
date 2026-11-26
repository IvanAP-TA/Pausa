import type { RankedDto } from "@pausa/api-types";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { api } from "@/api";
import { statsApi, type RankingQuery } from "@/api/stats";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { breakpoints, control, hair, space, useTheme, web } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Select } from "@/ui/Select";
import { Sheet } from "@/ui/Sheet";
import { Meter } from "@/ui/Surfaces";
import { ArrowDown, ArrowUp, CalendarRange, Filter } from "@/ui/lucide";
import { Toggle } from "@/ui/Toggle";
import { Empty, ErrorState, Heading, Loading, Screen, Tag, Text, Title } from "@/ui";
import { KindTag, num, useCircleScope } from "../diary/shared";
import { RequireSession, useMe } from "../session";
import { nextSort, yearPresets, type SortKey, type SortState } from "./ranking-controls";
import { VoteAvatars } from "./VoteAvatars";
import { yearRangeLabel } from "./year-range-label";
import { YearRangeSheet, type YearRange } from "./YearRangeSheet";
import "./stats.messages";

type Kind = "movie" | "tv" | "anime";
type Draft = { q: string; minVotes: string; everyone: boolean; by: string; genre: string };
const EMPTY: Draft = { q: "", minVotes: "", everyone: false, by: "", genre: "" };
const SORT_KEYS: SortKey[] = ["avg", "votes", "year"];

const toQuery = (d: Draft): RankingQuery => ({
  q: d.q.trim() || undefined,
  minVotes: d.minVotes === "" ? undefined : Number(d.minVotes),
  everyone: d.everyone || undefined,
  by: d.by || undefined,
  genre: d.genre || undefined,
});

function Entry({ circleId, item, position, people, meId }: { circleId: string; item: RankedDto; position: number; people: { userId: string; name: string; image: string | null }[]; meId: string }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.phone;
  const y = num(item.media.year);
  const avg = item.avg ? new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(item.avg / 2) : null;
  const rated = new Map(item.ratings.map((r) => [r.userId, r.rating]));
  // Everyone who saw it (rated or not), in the circle's order; a rating from someone no longer listed still shows by id.
  const tags = people.filter((p) => item.watchedBy.includes(p.userId) || rated.has(p.userId));
  const bigPos = position > 99 ? (wide ? 44 : 36) : wide ? 72 : 56;
  return (
    <View testID={`rank-${item.media.id}`} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <Title
          style={{ width: wide ? 72 : 52, textAlign: "right", fontSize: bigPos, lineHeight: Math.round(bigPos * 0.9) }}
          tone={position === 1 ? "accent" : "ink"}
        >
          {position}
        </Title>
        <Link href={href(`/c/${circleId}/m/${item.media.id}`) as Href} asChild>
          <Pressable role="link" aria-label={t("feed.openTitle", { title: item.media.title })} style={web({ cursor: "pointer" })}>
            <MediaPoster title={item.media.title} path={item.media.posterPath} width={wide ? 56 : 48} />
          </Pressable>
        </Link>
        <View style={{ flex: 1, gap: space["3xs"], minWidth: 0 }}>
          <Link href={href(`/log?media=${item.media.id}&circle=${circleId}`) as Href} asChild>
            <Pressable role="link" aria-label={t("stats.ranking.vote", { title: item.media.title })} style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center" }, web({ cursor: "pointer" })])}>
              <Title numberOfLines={3} style={{ fontSize: wide ? 26 : 22, lineHeight: wide ? 28 : 24 }}>
                {item.media.title}
              </Title>
            </Pressable>
          </Link>
          <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
            {y ? (
              <Text variant="small" tone="muted">
                {y}
              </Text>
            ) : null}
            <KindTag media={item.media} />
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: space.xs, minWidth: 64 }}>
          {avg ? (
            <>
              <Title style={{ fontSize: 40, lineHeight: 40 }}>{avg}</Title>
              <Meter value={(item.avg ?? 0) / 10} style={{ width: 64 }} />
              <Text variant="small" tone="muted">
                {t("ranking.votes", { count: item.votes })}
              </Text>
            </>
          ) : (
            <Text variant="small" tone="muted">
              {t("ranking.notRated")}
            </Text>
          )}
        </View>
      </View>
      {tags.length > 0 ? (
        <View style={{ paddingLeft: wide ? 72 + space.sm : 52 + space.sm }}>
          <VoteAvatars people={tags} ratings={rated} meId={meId} />
        </View>
      ) : null}
    </View>
  );
}

function RankingBody({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  useCircleScope(id);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const [kind, setKind] = useState<Kind>("movie");
  const [sort, setSort] = useState<SortState>(null);
  const [years, setYears] = useState<YearRange>({});
  const [yearsOpen, setYearsOpen] = useState(false);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const query = { ...toQuery(applied), kind, ...years, sort: sort?.key ?? "avg", dir: sort?.dir ?? "desc", page };
  const rank = useResource((signal) => statsApi.ranking(id, { ...query, locale }, signal), [id, locale, JSON.stringify(query)]);
  // A genre that the current type has no titles for (after switching type) is dropped; it only fires when it is stale, so no loop.
  useEffect(() => {
    if (applied.genre && rank.data && !(rank.data.genres ?? []).includes(applied.genre)) setApplied((d) => ({ ...d, genre: "" }));
  }, [rank.data, applied.genre]);
  const me = useMe();
  const people = (circle.data?.members ?? []).map((m) => ({ userId: m.userId, name: m.name, image: m.image ?? null }));
  const filtered = Object.values(toQuery(applied)).filter((v) => v !== undefined).length;
  const yearsOn = years.yearFrom !== undefined || years.yearTo !== undefined;
  const yearMin = num(rank.data?.yearMin) ?? null;
  const yearMax = num(rank.data?.yearMax) ?? null;
  const genreOptions = (rank.data?.genres ?? []).map((g) => ({ value: g, label: t(`profile.genres.${g as "action"}`) })).sort((a, b) => a.label.localeCompare(b.label, locale));
  const clearAll = () => { setApplied(EMPTY); setYears({}); setPage(0); };
  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const pages = rank.data ? Math.max(1, Math.ceil(rank.data.total / rank.data.pageSize)) : 1;

  return (
    <Screen>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <Heading level={1}>{circle.data?.name ?? t("ranking.title")}</Heading>
      <Text tone="ink2">{t("ranking.lede")}</Text>
      <Choice<Kind>
        label={t("stats.ranking.kindLabel")}
        value={kind}
        onChange={(k) => { setKind(k); setPage(0); }}
        options={(["movie", "tv", "anime"] as const).map((k) => ({ value: k, label: t(`kind.${k}`), testID: `kind-${k}` }))}
      />
      <View role="group" aria-label={t("ranking.filters.sort")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {SORT_KEYS.map((k) => {
          const dir = sort?.key === k ? sort.dir : "off";
          const label = t(`ranking.sort.${k}`);
          return (
            <Button
              key={k}
              label={label}
              variant={dir === "off" ? "secondary" : "primary"}
              icon={dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : undefined}
              accessibilityLabel={t(dir === "off" ? "stats.ranking.sortOff" : dir === "desc" ? "stats.ranking.sortDesc" : "stats.ranking.sortAsc", { label })}
              testID={`sort-${k}`}
              dataSet={{ dir }}
              onPress={() => { setSort((s) => nextSort(s, k)); setPage(0); }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Button label={t("ranking.filters.title")} variant="secondary" icon={Filter} testID="open-filters" onPress={() => { setDraft(applied); setOpen(true); }} />
        <Button label={yearsOn ? yearRangeLabel(t, years, yearPresets(new Date().getFullYear(), yearMin, yearMax)) : t("stats.ranking.years")} variant={yearsOn ? "primary" : "secondary"} icon={CalendarRange} testID="open-years" onPress={() => setYearsOpen(true)} />
        {filtered > 0 ? <Tag tone="accent" label={t("diary.feed.active", { count: filtered })} /> : null}
        {filtered > 0 || yearsOn ? <Button label={t("ranking.filters.reset")} variant="quiet" onPress={clearAll} /> : null}
      </View>
      <YearRangeSheet key={yearsOpen ? "open" : "closed"} open={yearsOpen} onClose={() => setYearsOpen(false)} value={years} onApply={(r) => { setYears(r); setPage(0); }} yearMin={yearMin} yearMax={yearMax} />

      {rank.loading && !rank.data ? <Loading rows={5} /> : null}
      {rank.error ? <ErrorState error={rank.error} onRetry={rank.reload} /> : null}
      {rank.data ? (
        <>
          <Text variant="small" tone="muted" role="status" aria-live="polite">
            {t("ranking.count", { count: rank.data.total })}
          </Text>
          {rank.data.items.length === 0 ? (
            <Empty title={filtered > 0 || yearsOn ? t("ranking.empty") : t("ranking.emptyAll")}>
              {filtered > 0 || yearsOn ? <Button label={t("ranking.filters.reset")} variant="secondary" onPress={clearAll} /> : <Button label={t("feed.emptyCta")} href={href("/log")} />}
            </Empty>
          ) : (
            <View role="list" style={{ borderTopWidth: hair, borderColor: "transparent" }}>
              {rank.data.items.map((item, i) => (
                <Entry circleId={id} key={item.media.id} item={item} position={rank.data!.page * rank.data!.pageSize + i + 1} people={people} meId={me.id} />
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
        <Select<string>
          label={t("stats.ranking.genre")}
          value={draft.genre}
          testID="rank-genre"
          onChange={set("genre")}
          options={[{ value: "", label: t("ranking.filters.any") }, ...genreOptions]}
        />
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
