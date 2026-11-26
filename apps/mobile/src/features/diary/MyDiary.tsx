import type { DiaryCounts, LogDto, ProgressDto } from "@pausa/api-types";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { usePages } from "@/api/usePages";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { Sheet } from "@/ui/Sheet";
import { Download, ListChecks, Lock, Pencil, Plus, STROKE, Trash2, Users, X } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Empty, ErrorState, Heading, Loading, Notice, RowList, Screen, Text, Title } from "@/ui";
import { PendingLogs } from "../offline/PendingLogs";
import { useOutbox } from "../offline/OutboxProvider";
import { RequireSession, useMe } from "../session";
import { CardList, LogCard, num, useEpisodeLabel } from "./shared";
import "./diary.messages";

/** `inList`: it is an item of a `role="list"` (the diary's "continue" row); alone (a title page) it is not a list item. */
export function ProgressCard({ p, onChanged, onGone, inList }: { p: ProgressDto; onChanged: () => void; onGone: () => void; inList?: boolean }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const epLabel = useEpisodeLabel();
  const act = useAction();
  const where = epLabel(num(p.season), num(p.episode)) ?? t("diary.progress.started");
  return (
    <View {...(inList ? { role: "listitem" as const } : {})} testID={`progress-${p.media.id}`} style={{ width: 280, borderWidth: hair, borderColor: c.rule, padding: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <MediaPoster title={p.media.title} path={p.media.posterPath} width={48} />
        <View style={{ flex: 1, gap: space["2xs"] }}>
          <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
            {p.media.title}
          </Title>
          <Text variant="small" tone="ink2" testID={`progress-where-${p.media.id}`}>
            {where}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button
          label={t("feed.nextEpisode")}
          accessibilityLabel={`${t("feed.nextEpisode")}: ${p.media.title}`}
          busy={act.busy}
          disabled={p.next === null}
          onPress={async () => {
            if (await act.run(() => diaryApi.advance(p.media.id))) onChanged();
          }}
          style={{ paddingHorizontal: space.md }}
        />
        <Button
          label={t("feed.nextSeason")}
          accessibilityLabel={`${t("feed.nextSeason")}: ${p.media.title}`}
          variant="secondary"
          busy={act.busy}
          onPress={async () => {
            if (await act.run(() => diaryApi.advance(p.media.id, true))) onChanged();
          }}
          style={{ paddingHorizontal: space.md }}
        />
        <Button label={t("log.submit")} accessibilityLabel={`${t("log.submit")}: ${p.media.title}`} variant="quiet" href={`${href("/log")}?media=${p.media.id}`} style={{ paddingHorizontal: space.md }} />
        <Button
          label={t("feed.stopWatching")}
          accessibilityLabel={`${t("feed.stopWatching")}: ${p.media.title}`}
          variant="quiet"
          busy={act.busy}
          onPress={async () => {
            if (await act.run(() => diaryApi.clearProgress(p.media.id))) onGone();
          }}
          style={{ paddingHorizontal: space.md }}
        />
      </View>
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Continue() {
  const { t, locale } = useI18n();
  const list = useResource((signal) => diaryApi.progress(locale, signal), [locale]);
  const [gone, setGone] = useState<string[]>([]);
  if (list.loading && !list.data) return <Loading rows={1} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  const items = (list.data ?? []).filter((p) => !gone.includes(p.media.id));
  if (items.length === 0) return null;
  return (
    <Section title={t("diary.progress.title")} first>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} role="list">
        {items.map((p) => (
          <ProgressCard key={p.media.id} inList p={p} onChanged={() => void list.reload()} onGone={() => setGone((g) => [...g, p.media.id])} />
        ))}
      </View>
    </Section>
  );
}

/** Where this viewing shows (v1 diary row): who sees it, the one thing to do about it, and the bin. */
function Actions({ log, onShares, onGone, onNotice }: { log: LogDto; onShares: (circles: string[]) => void; onGone: () => void; onNotice: (text: string) => void }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const me = useMe();
  const shared = log.sharedIn;
  const nameOf = (id: string) => me.circles.find((x) => x.id === id)?.name ?? "…";
  const others = me.circles.filter((x) => !shared.includes(x.id));
  const [target, setTarget] = useState("");
  const [asking, setAsking] = useState(false);
  const act = useAction();
  const del = useAction();
  const tall = { minHeight: control };
  const save = async (next: string[], notice: string) => {
    if (await act.run(() => diaryApi.setShares(log.id, next))) {
      onShares(next);
      onNotice(notice);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        {shared.length > 0 ? <Users size={16} strokeWidth={STROKE} color={c.ink2} aria-hidden /> : <Lock size={16} strokeWidth={STROKE} color={c.ink2} aria-hidden />}
        <Text variant="small" tone="ink2" style={{ flex: 1 }} testID={`shared-${log.id}`}>
          {shared.length > 0 ? `${t("space.sharedWith")} ${shared.map(nameOf).join(", ")}` : t("space.onlyYou")}
        </Text>
      </View>
      {shared.length > 0 ? (
        <View role="list" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {shared.map((cid) => (
            <View key={cid} role="listitem" style={{ flexDirection: "row", alignItems: "center", borderWidth: hair, borderColor: c.rule }}>
              <Text variant="small" style={{ paddingHorizontal: space.sm }}>{nameOf(cid)}</Text>
              <Pressable
                role="button"
                aria-label={t("space.removeFrom", { circle: nameOf(cid) })}
                disabled={act.busy}
                onPress={() => void save(shared.filter((x) => x !== cid), t("space.notice.unshared"))}
                testID={`unshare-${log.id}-${cid}`}
                style={[{ width: control, height: control, alignItems: "center", justifyContent: "center", borderLeftWidth: hair, borderColor: c.rule }, web({ cursor: "pointer" })]}
              >
                <X size={16} strokeWidth={1.8} color={c.muted} aria-hidden />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {others.length === 1 ? (
        <View style={{ flexDirection: "row" }}>
          <Button size="sm" icon={Plus} label={t("space.addTo", { circle: others[0]!.name })} busy={act.busy} onPress={() => void save([...shared, others[0]!.id], t("space.notice.shared"))} testID={`add-${log.id}`} style={tall} />
        </View>
      ) : others.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: space.xs }}>
          <Select label={t("space.addToGroup")} value={target} options={[{ value: "", label: t("space.addToGroup") }, ...others.map((x) => ({ value: x.id, label: x.name }))]} onChange={setTarget} testID={`add-to-${log.id}`} />
          <Button
            size="sm"
            label={t("space.addShort")}
            disabled={!target}
            busy={act.busy}
            onPress={() => {
              void save([...shared, target], t("space.notice.shared"));
              setTarget("");
            }}
            testID={`add-${log.id}`}
            style={tall}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        {shared.length > 0 ? <Button size="sm" variant="quiet" label={t("space.makePrivate")} busy={act.busy} onPress={() => void save([], t("space.notice.private"))} testID={`private-${log.id}`} style={tall} /> : null}
        {me.circles.length > 1 && shared.length < me.circles.length ? (
          <Button size="sm" variant="quiet" label={t("space.openToAll")} busy={act.busy} onPress={() => void save(me.circles.map((x) => x.id), t("space.notice.open"))} testID={`open-all-${log.id}`} style={tall} />
        ) : null}
        <Button size="sm" variant="secondary" icon={Pencil} label={t("manage.edit")} accessibilityLabel={`${t("manage.edit")}: ${log.media.title}`} href={href(`/log/${log.id}`)} style={tall} />
        <Button size="sm" variant="quiet" icon={Trash2} label={t("manage.delete")} accessibilityLabel={t("space.delete", { title: log.media.title })} onPress={() => setAsking(true)} testID={`delete-${log.id}`} style={tall} />
      </View>
      {[act.error, del.error].filter(Boolean).map((e, i) => (
        <Text key={i} tone="error" role="alert">{errorMessage(t, e)}</Text>
      ))}
      <Sheet title={t("space.deleteTitle", { title: log.media.title })} open={asking} onClose={() => setAsking(false)}>
        <Text>{shared.length > 0 ? t("space.deleteBodyShared") : t("space.deleteBody")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          <Button
            label={del.busy ? t("space.deleting") : t("space.deleteCta")}
            variant="danger"
            busy={del.busy}
            onPress={async () => {
              if (await del.run(() => diaryApi.deleteLog(log.id))) {
                setAsking(false);
                onNotice(t("space.notice.deleted"));
                onGone();
              }
            }}
            testID="confirm-delete"
          />
          <Button label={t("space.cancel")} variant="quiet" onPress={() => setAsking(false)} />
        </View>
      </Sheet>
    </View>
  );
}

/** v1 nav: "Tutte (n)" and "Solo private (n)", an accent line under the current one. */
function Tabs({ only, counts }: { only: boolean; counts: DiaryCounts | null }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const tab = (on: boolean, to: string, label: string, id: string) => (
    <Link href={to as Href} asChild replace>
      <Pressable role="link" aria-current={on ? "page" : undefined} testID={id} style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center", borderBottomWidth: 2, borderColor: on ? c.accent : "transparent" }, web({ cursor: "pointer" })])}>
        <Text variant={on ? "strong" : "body"} tone={on ? "ink" : "muted"} style={{ fontSize: 16 }}>{label}</Text>
      </Pressable>
    </Link>
  );
  return (
    <View role="navigation" aria-label={t("space.show")} style={{ flexDirection: "row", gap: space.lg, borderBottomWidth: hair, borderColor: c.rule }}>
      {tab(!only, href("/diary"), t("space.all", { count: counts?.all ?? 0 }), "tab-all")}
      {tab(only, `${href("/diary")}?only=private`, t("space.onlyPrivate", { count: counts?.private ?? 0 }), "tab-private")}
    </View>
  );
}

function DiaryBody() {
  const { t, href, locale } = useI18n();
  const { sent } = useOutbox();
  const { only: onlyParam } = useLocalSearchParams<{ only?: string }>();
  const only = onlyParam === "private";
  const me = useMe();
  const [notice, setNotice] = useState<string | null>(null);
  // A viewing the outbox has just sent is in the diary now: read it again.
  const diary = usePages((before, signal) => diaryApi.diary({ before, locale, only: only ? "private" : undefined }, signal), [locale, sent, only]);
  const counts = useResource((signal) => diaryApi.diaryCounts(signal), [sent]);
  const changed = () => void counts.reload();
  return (
    <Screen onRefresh={() => void diary.reload()} refreshing={diary.status === "loading" && diary.items.length > 0} onNearEnd={() => void diary.loadMore()}>
      <Heading level={1}>{t("space.diaryTitle")}</Heading>
      <Text variant="lead" tone="ink2">{t("space.lede")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {me.circles.length > 0 ? <Button icon={Plus} label={t("space.add")} href={`${href("/log")}?private=1`} testID="add-private" /> : null}
        <Button icon={Download} label={t("space.import")} variant="secondary" href={href("/import")} />
        <Button icon={ListChecks} label={t("space.manageImports")} variant="quiet" href={href("/imports")} testID="manage-imports" />
      </View>
      {notice ? <Notice>{notice}</Notice> : null}
      <PendingLogs />
      <Continue />
      <Tabs only={only} counts={counts.data ?? null} />
      {diary.status === "loading" ? <Loading rows={4} /> : null}
      {diary.status === "error" ? <ErrorState error={diary.error} onRetry={diary.reload} /> : null}
      {diary.status === "ready" && diary.items.length === 0 ? (
        <Empty title={only ? t("space.emptyPrivateTitle") : t("space.emptyTitle")} body={t("space.emptyBody")}>
          <Button label={t("feed.emptyCta")} href={href("/log")} testID="empty-cta" />
        </Empty>
      ) : null}
      {diary.items.length > 0 ? (
        <CardList>
          {diary.items.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              hideAuthor
              footer={
                <Actions
                  log={log}
                  onNotice={setNotice}
                  onShares={(circles) => {
                    diary.setItems((l) => (only && circles.length > 0 ? l.filter((x) => x.id !== log.id) : l.map((x) => (x.id === log.id ? { ...x, sharedIn: circles } : x))));
                    changed();
                  }}
                  onGone={() => {
                    diary.setItems((l) => l.filter((x) => x.id !== log.id));
                    changed();
                  }}
                />
              }
            />
          ))}
        </CardList>
      ) : null}
      {diary.more === "loading" ? <Loading rows={1} /> : null}
      {diary.more === "error" ? (
        <View role="alert" style={{ gap: space.xs }}>
          <Text tone="error">{errorMessage(t, diary.moreError)}</Text>
          <Button label={t("errors.retry")} variant="secondary" onPress={() => void diary.loadMore()} />
        </View>
      ) : null}
      {diary.next && diary.more === "idle" ? <Button label={t("diary.feed.more")} variant="secondary" onPress={() => void diary.loadMore()} testID="load-more" /> : null}
    </Screen>
  );
}

export function MyDiary() {
  return (
    <RequireSession>
      <DiaryBody />
    </RequireSession>
  );
}
