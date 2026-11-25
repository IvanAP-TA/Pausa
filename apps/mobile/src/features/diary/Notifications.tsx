import type { NotificationDto } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { usePages } from "@/api/usePages";
import { useI18n, type MessageKey } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Empty, ErrorState, Heading, Loading, Screen, Text } from "@/ui";
import { RequireSession, useMe, useSession } from "../session";
import { noticeHref } from "./notice-href";
import "./diary.messages";

const KNOWN = ["log", "comment", "reaction", "now_watching", "circle_join", "serata_invite", "mention"] as const;
type Known = (typeof KNOWN)[number];
const isKnown = (t: string): t is Known => (KNOWN as readonly string[]).includes(t);

function Notice({ n }: { n: NotificationDto }) {
  const { t, rich, href, locale } = useI18n();
  const { c } = useTheme();
  const name = n.actor?.name ?? "?";
  const key: MessageKey = isKnown(n.type) ? (n.type === "mention" ? "diary.notif.mention" : (`notifications.${n.type}` as MessageKey)) : "diary.notif.other";
  const sentence: ReactNode = rich(key, { name, title: n.media?.title ?? "", circle: n.circleName ?? "" }, { b: (kids) => <Text variant="strong">{kids}</Text> });
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(n.createdAt));
  return (
    <View role="listitem">
    <Link href={noticeHref(n, href) as Href} asChild>
      <Pressable
        role="link"
        testID={`notice-${n.id}`}
        style={StyleSheet.flatten([{ minHeight: control, flexDirection: "row", gap: space.sm, alignItems: "center", paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }, web({ cursor: "pointer" })])}
      >
        {/* unread: a named image, first in the link, so the link's name starts with "Non letta" (no aria-label to disagree with the visible text) */}
        <View {...(n.read ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": t("diary.notif.unreadOne") })} style={{ width: 10, height: 10, backgroundColor: n.read ? "transparent" : c.accent }} />
        <Avatar name={name} image={n.actor?.image} size={36} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <Text>{sentence}</Text>
          <Text variant="small" tone="muted">
            {[n.circleName, when].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </Pressable>
    </Link>
    </View>
  );
}

function NotificationsBody() {
  const { t, locale } = useI18n();
  const me = useMe();
  const { reload: reloadMe } = useSession();
  const [circle, setCircle] = useState("");
  const inbox = usePages((before, signal) => diaryApi.notifications({ circle: circle || undefined, before, locale }, signal), [circle, locale]);
  const mark = useAction();
  const unreadHere = inbox.items.some((n) => !n.read);
  const markRead = async (circleId?: string) => {
    if (await mark.run(() => diaryApi.markRead(circleId))) {
      inbox.setItems((l) => l.map((n) => (!circleId || n.circleId === circleId ? { ...n, read: true } : n)));
      void reloadMe();
    }
  };
  return (
    <Screen onRefresh={() => void inbox.reload()} refreshing={inbox.status === "loading" && inbox.items.length > 0} onNearEnd={() => void inbox.loadMore()}>
      <Heading level={1}>{t("notifications.title")}</Heading>
      {me.circles.length > 1 ? (
        <Choice label={t("diary.notif.filter")} value={circle} onChange={setCircle} options={[{ value: "", label: t("feed.filter.any") }, ...me.circles.map((c) => ({ value: c.id, label: c.name }))]} />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {circle ? <Button label={t("diary.notif.readCircle", { name: me.circles.find((c) => c.id === circle)?.name ?? "" })} variant="secondary" busy={mark.busy} disabled={!unreadHere} onPress={() => void markRead(circle)} testID="read-circle" /> : null}
        <Button label={t("diary.notif.readAll")} variant="secondary" busy={mark.busy} disabled={!unreadHere && me.circles.every((c) => c.unread === 0)} onPress={() => void markRead()} testID="read-all" />
      </View>
      {mark.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, mark.error)}
        </Text>
      ) : null}
      {inbox.status === "loading" ? <Loading rows={4} /> : null}
      {inbox.status === "error" ? <ErrorState error={inbox.error} onRetry={inbox.reload} /> : null}
      {inbox.status === "ready" && inbox.items.length === 0 ? <Empty title={t("notifications.empty")} /> : null}
      {inbox.items.length > 0 ? (
        <View role="list" style={{ borderTopWidth: hair }}>
          {inbox.items.map((n) => (
            <Notice key={n.id} n={n} />
          ))}
        </View>
      ) : null}
      {inbox.more === "loading" ? <Loading rows={1} /> : null}
      {inbox.more === "error" ? (
        <View role="alert" style={{ gap: space.xs }}>
          <Text tone="error">{errorMessage(t, inbox.moreError)}</Text>
          <Button label={t("errors.retry")} variant="secondary" onPress={() => void inbox.loadMore()} />
        </View>
      ) : null}
      {inbox.next && inbox.more === "idle" ? <Button label={t("diary.feed.more")} variant="secondary" onPress={() => void inbox.loadMore()} testID="load-more" /> : null}
    </Screen>
  );
}

export function Notifications() {
  return (
    <RequireSession>
      <NotificationsBody />
    </RequireSession>
  );
}
