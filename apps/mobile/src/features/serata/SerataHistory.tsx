import type { CandidateDto, ListDetail, ListSummary, MediaDto, Mode, SerataSummary } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { listsApi } from "@/api/lists";
import { errorMessage } from "@/api/errors";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { TitleSearch } from "@/features/TitleSearch";
import { RequireSession, useMe } from "@/features/session";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { MediaPoster } from "@/ui/MediaPoster";
import { moved } from "@/ui/moved";
import { Row, RowList } from "@/ui/Row";
import { Screen } from "@/ui/Screen";
import { Section } from "@/ui/Section";
import { Sortable } from "@/ui/Sortable";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { titleIdentity } from "@/features/title-identity";
import { WatchedSheet } from "./WatchedSheet";
import "./serata.messages";

export const MIN_TITLES = 2;
export const MAX_TITLES = 8;

type Pick = { key: string; kind: string; title: string; year: number | null; posterPath: string | null };
const pickOf = (c: CandidateDto): Pick => ({ key: c.key, kind: c.kind, title: c.title, year: c.year === null ? null : Number(c.year), posterPath: c.posterPath });
/** A title Pausa already holds is named to the API as `local:<id>` (a search result has its own `key`). */
const pickOfMedia = (m: MediaDto): Pick => ({ key: `local:${m.id}`, kind: m.kind, title: m.title, year: m.year === null ? null : Number(m.year), posterPath: m.posterPath });

type Source = "search" | "lists" | "picks";

/** A title in a pool (a list, the recommendations): poster, name, and the add button. */
function PoolRow({ pick, picked, full, onAdd }: { pick: Pick; picked: boolean; full: boolean; onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <Row testID={`pool-${pick.key}`}>
      <MediaPoster title={pick.title} path={pick.posterPath} width={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="strong" numberOfLines={2}>{pick.title}</Text>
        {pick.year !== null ? <Text variant="small" tone="muted">{pick.year}</Text> : null}
      </View>
      <Button
        label={picked ? t("serataApp.create.addedShort") : t("serataApp.create.addShort")}
        accessibilityLabel={picked ? t("serataApp.create.added", { title: pick.title }) : t("serataApp.create.add", { title: pick.title })}
        variant={picked ? "quiet" : "secondary"}
        disabled={picked || full}
        onPress={onAdd}
      />
    </Row>
  );
}

/** One list of the Cerchia (or my watchlist): opens to show its titles, loaded when asked. */
function ListPool({ list, has, full, onAdd }: { list: ListSummary; has: (p: Pick) => boolean; full: boolean; onAdd: (p: Pick) => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const detail = useResource<ListDetail | null>((signal) => (open ? listsApi.detail(list.id, locale, signal) : Promise.resolve(null)), [open, list.id, locale]);
  return (
    <View>
      <Row onPress={() => setOpen((o) => !o)} testID={`list-${list.id}`}>
        <View style={{ flex: 1 }}>
          <Text variant="strong" numberOfLines={1}>{list.name}</Text>
          <Text variant="small" tone="muted">{t("lists.items", { count: list.items })} · {list.circleId ? t("lists.group") : t("lists.personal")}</Text>
        </View>
        <Text tone="ink2" aria-hidden>{open ? "−" : "+"}</Text>
      </Row>
      {open && detail.loading ? <Loading rows={2} /> : null}
      {open && detail.error ? <ErrorState error={detail.error} onRetry={detail.reload} /> : null}
      {open && detail.data ? (
        detail.data.items.length === 0 ? (
          <Text tone="muted">{t("serataApp.create.listEmpty")}</Text>
        ) : (
          <RowList>
            {detail.data.items.map((i) => {
              const p = pickOfMedia(i.media);
              return <PoolRow key={p.key} pick={p} picked={has(p)} full={full} onAdd={() => onAdd(p)} />;
            })}
          </RowList>
        )
      ) : null}
    </View>
  );
}

function Lists({ circleId, has, full, onAdd }: { circleId: string; has: (p: Pick) => boolean; full: boolean; onAdd: (p: Pick) => void }) {
  const { t } = useI18n();
  const lists = useResource((signal) => listsApi.overview(circleId, signal), [circleId]);
  if (lists.loading) return <Loading rows={2} />;
  if (lists.error) return <ErrorState error={lists.error} onRetry={lists.reload} />;
  const usable = (lists.data ?? []).filter((l) => l.items > 0);
  if (usable.length === 0) return <Text tone="muted">{t("serataApp.create.listsNone")}</Text>;
  return (
    <RowList>
      {usable.map((l) => (
        <ListPool key={l.id} list={l} has={has} full={full} onAdd={onAdd} />
      ))}
    </RowList>
  );
}

function Picks({ circleId, has, full, onAdd }: { circleId: string; has: (p: Pick) => boolean; full: boolean; onAdd: (p: Pick) => void }) {
  const { t, locale } = useI18n();
  const recs = useResource((signal) => serataApi.recommendations(circleId, locale, 12, signal), [circleId, locale]);
  if (recs.loading) return <Loading rows={2} />;
  if (recs.error) return <ErrorState error={recs.error} onRetry={recs.reload} />;
  if (!recs.data || recs.data.length === 0) return <Text tone="muted">{t("serataApp.create.picksNone")}</Text>;
  return (
    <RowList>
      {recs.data.map((r) => {
        const p = pickOfMedia(r.media);
        return <PoolRow key={p.key} pick={p} picked={has(p)} full={full} onAdd={() => onAdd(p)} />;
      })}
    </RowList>
  );
}

/** The new-Serata form: a mode, 2 to 8 titles from search, the Cerchia's lists or its recommendations, in seeding order. */
function NewSerata({ circleId }: { circleId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { href } = useI18n();
  const [mode, setMode] = useState<Mode>("bracket");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [source, setSource] = useState<Source>("search");
  const [spoken, setSpoken] = useState("");
  const create = useAction();
  const has = useCallback((p: { key: string; kind: string; title: string; year: number | bigint | null }) => picks.some((x) => x.key === p.key || titleIdentity(x) === titleIdentity(p)), [picks]);
  const full = picks.length >= MAX_TITLES;
  const add = (p: Pick) => {
    if (has(p) || full) return;
    setPicks((all) => [...all, p]);
  };
  const move = (from: number, to: number) => {
    setPicks((all) => moved(all, from, to));
    const p = picks[from];
    if (p) setSpoken(t("serataApp.create.moved", { title: p.title, n: to + 1 }));
  };
  const go = async () => {
    const res = await create.run(() => serataApi.create({ circleId, mode, mediaKeys: picks.map((p) => p.key) }));
    if (res) router.push(href(`/s/${res.value.code}`) as never);
  };
  const ready = picks.length >= MIN_TITLES;
  return (
    <View style={{ gap: space.md }}>
      <Choice
        label={t("serata.modeLabel")}
        value={mode}
        options={[
          { value: "bracket", label: t("serata.mode.bracket") },
          { value: "table", label: t("serata.mode.table") },
        ]}
        onChange={setMode}
      />
      <Text variant="small" tone="muted">{t(`serata.modeHint.${mode}`)}</Text>

      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="ink2" role="heading" aria-level={3} testID="picked-count">
          {t("serataApp.create.selectedTitle")} · {t("serata.picked", { count: picks.length, max: MAX_TITLES })}
        </Text>
        {picks.length === 0 ? (
          <Text tone="muted">{t("serata.pickHint")}</Text>
        ) : (
          <>
            <Text variant="small" tone="muted">{t("serataApp.create.seedHint")}</Text>
            <Sortable
              testID="picked-list"
              items={picks}
              keyOf={(p) => p.key}
              onMove={move}
              labels={{
                drag: (p) => t("serataApp.create.drag", { title: p.title }),
                up: (p) => t("serataApp.create.up", { title: p.title }),
                down: (p) => t("serataApp.create.down", { title: p.title }),
              }}
              renderItem={(p, i) => (
                <>
                  <Text tone="muted" style={{ width: 18 }}>{i + 1}</Text>
                  <MediaPoster title={p.title} path={p.posterPath} width={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="strong" numberOfLines={2}>{p.title}</Text>
                    {p.year !== null ? <Text variant="small" tone="muted">{p.year}</Text> : null}
                  </View>
                </>
              )}
              trailing={(p) => <Button label="×" variant="quiet" accessibilityLabel={t("serataApp.create.remove", { title: p.title })} onPress={() => setPicks((all) => all.filter((x) => x.key !== p.key))} style={{ paddingHorizontal: 0 }} />}
            />
          </>
        )}
        <Text role="status" aria-live="polite" variant="small" tone="muted">{spoken}</Text>
      </View>

      <Choice
        label={t("serataApp.create.from")}
        value={source}
        options={[
          { value: "search", label: t("serataApp.create.fromSearch") },
          { value: "lists", label: t("serataApp.create.fromLists") },
          { value: "picks", label: t("serataApp.create.fromPicks") },
        ]}
        onChange={setSource}
      />
      {full ? <Text tone="ink2" role="status">{t("serataApp.create.full", { max: MAX_TITLES })}</Text> : null}
      {source === "search" ? (
        <TitleSearch
          search={serataApi.search}
          onPick={(c) => add(pickOf(c))}
          isPicked={(c) => has(pickOf(c))}
          disabled={full}
          placeholder={t("serata.search")}
          labels={{
            field: t("serata.search"),
            none: t("serataApp.create.noResults"),
            add: (title) => t("serataApp.create.add", { title }),
            added: (title) => t("serataApp.create.added", { title }),
            addLabel: t("serataApp.create.addShort"),
            addedLabel: t("serataApp.create.addedShort"),
          }}
        />
      ) : null}
      {source === "lists" ? <Lists circleId={circleId} has={has} full={full} onAdd={add} /> : null}
      {source === "picks" ? <Picks circleId={circleId} has={has} full={full} onAdd={add} /> : null}

      {create.error ? <Text role="alert" tone="error">{errorMessage(t, create.error)}</Text> : null}
      <Text variant="small" tone="muted" role="status">{t("serata.needTwo", { count: picks.length })}</Text>
      <Button label={t("serata.createWith", { count: Math.max(picks.length, 2) })} onPress={go} busy={create.busy} disabled={!ready} fullWidth testID="create-serata" />
    </View>
  );
}

const when = (ms: number, date: (ms: number) => string) => date(ms);

/** One past Serata: where it stands or who won, with its actions. */
function HistoryCard({ s, circleId, onChanged }: { s: SerataSummary; circleId: string; onChanged: () => void }) {
  const { t, href, date } = useI18n();
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
        <Text variant="small" tone="muted">
          {when(s.finishedAt ?? s.createdAt, date)} · {t(`serata.mode.${s.mode as Mode}`)} · {t("serata.result.people", { count: s.people })}
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
    <View testID="history">
      {list.data.map((s) => (
        <HistoryCard key={s.code} s={s} circleId={circleId} onChanged={() => setLinked(true)} />
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
      <Heading level={1}>{t("serata.title")}</Heading>
      <Text variant="lead" tone="ink2">{t("serata.lede")}</Text>
      <Section first>
        <NewSerata circleId={circleId} />
      </Section>
      <Section title={t("serata.recent")}>
        <History circleId={circleId} />
      </Section>
    </Screen>
  );
}
