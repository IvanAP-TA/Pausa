import type { LogDto, ProgressDto } from "@pausa/api-types";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { usePages } from "@/api/usePages";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Chip, ChipGroup } from "@/ui/Chip";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Empty, ErrorState, Heading, Loading, Notice, RowList, Screen, Text, Title } from "@/ui";
import { PendingLogs } from "../offline/PendingLogs";
import { useOutbox } from "../offline/OutboxProvider";
import { RequireSession, useMe } from "../session";
import { LogCard, num, useEpisodeLabel } from "./shared";
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

function Actions({ log, onGone }: { log: LogDto; onGone: () => void }) {
  const { t, href } = useI18n();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [circles, setCircles] = useState(log.sharedIn);
  const [shared, setShared] = useState(log.sharedIn);
  const share = useAction();
  const del = useAction();
  const names = shared.map((id) => me.circles.find((c) => c.id === id)?.name).filter(Boolean);
  const [saved, setSaved] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="small" tone="ink2" testID={`shared-${log.id}`}>
        {names.length ? t("diary.share.with", { names: names.join(", ") }) : t("space.onlyYou")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("manage.edit")} accessibilityLabel={`${t("manage.edit")}: ${log.media.title}`} variant="secondary" href={href(`/log/${log.id}`)} />
        <Button label={t("diary.share.change")} accessibilityLabel={`${t("diary.share.change")}: ${log.media.title}`} variant="quiet" onPress={() => setOpen((o) => !o)} testID={`share-toggle-${log.id}`} />
        <ConfirmButton
          label={t("manage.delete")}
          accessibilityLabel={t("space.delete", { title: log.media.title })}
          confirmLabel={t("space.deleteCta")}
          busy={del.busy}
          onConfirm={async () => {
            if (await del.run(() => diaryApi.deleteLog(log.id))) onGone();
          }}
        />
      </View>
      {open ? (
        <View style={{ gap: space.sm }}>
          <ChipGroup label={t("log.who")} hint={circles.length === 0 ? t("space.notice.private") : undefined}>
            {me.circles.map((c) => (
              <Chip key={c.id} label={c.name} on={circles.includes(c.id)} onPress={() => setCircles((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))} testID={`share-${log.id}-${c.id}`} />
            ))}
          </ChipGroup>
          <Button
            label={share.busy ? t("space.saving") : t("diary.share.save")}
            busy={share.busy}
            onPress={async () => {
              if (await share.run(() => diaryApi.setShares(log.id, circles))) {
                setShared(circles);
                setSaved(true);
                setOpen(false);
              }
            }}
            testID={`share-save-${log.id}`}
          />
        </View>
      ) : null}
      {saved ? <Notice>{t("diary.share.saved")}</Notice> : null}
      {[share.error, del.error].filter(Boolean).map((e, i) => (
        <Text key={i} tone="error" role="alert">
          {errorMessage(t, e)}
        </Text>
      ))}
    </View>
  );
}

function DiaryBody() {
  const { t, href, locale } = useI18n();
  const { sent } = useOutbox();
  // A viewing the outbox has just sent is in the diary now: read it again.
  const diary = usePages((before, signal) => diaryApi.diary({ before, locale }, signal), [locale, sent]);
  return (
    <Screen onRefresh={() => void diary.reload()} refreshing={diary.status === "loading" && diary.items.length > 0} onNearEnd={() => void diary.loadMore()}>
      <Heading level={1}>{t("space.diaryTitle")}</Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("tabs.logShort")} href={href("/log")} />
        <Button label={t("profile.import")} variant="secondary" href={href("/import")} />
      </View>
      <PendingLogs />
      <Continue />
      {diary.status === "loading" ? <Loading rows={4} /> : null}
      {diary.status === "error" ? <ErrorState error={diary.error} onRetry={diary.reload} /> : null}
      {diary.status === "ready" && diary.items.length === 0 ? (
        <Empty title={t("space.emptyTitle")} body={t("space.emptyBody")}>
          <Button label={t("feed.emptyCta")} href={href("/log")} testID="empty-cta" />
        </Empty>
      ) : null}
      {diary.items.length > 0 ? (
        <RowList>
          {diary.items.map((log) => (
            <LogCard key={log.id} log={log} hideAuthor footer={<Actions log={log} onGone={() => diary.setItems((l) => l.filter((x) => x.id !== log.id))} />} />
          ))}
        </RowList>
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
