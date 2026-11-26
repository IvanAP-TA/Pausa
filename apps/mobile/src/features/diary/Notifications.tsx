import type { NotificationDto } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { usePages } from "@/api/usePages";
import { useI18n, type MessageKey } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Chevron, Empty, ErrorState, Heading, Loading, Screen, Text, TextLink } from "@/ui";
import { RequireSession, useMe, useSession } from "../session";
import { relativeTime } from "./dates";
import { noticeHref } from "./notice-href";
import "./diary.messages";

const KNOWN = ["log", "comment", "reaction", "now_watching", "circle_join", "serata_invite", "mention"] as const;
type Known = (typeof KNOWN)[number];
const isKnown = (t: string): t is Known => (KNOWN as readonly string[]).includes(t);

function Notice({ n, unread }: { n: NotificationDto; unread: boolean }) {
  const { t, rich, href, locale } = useI18n();
  const { c } = useTheme();
  const name = n.actor?.name ?? "?";
  const key: MessageKey = isKnown(n.type) ? (n.type === "mention" ? "diary.notif.mention" : (`notifications.${n.type}` as MessageKey)) : "diary.notif.other";
  const sentence: ReactNode = rich(key, { name, title: n.media?.title ?? "", circle: n.circleName ?? "" }, { b: (kids) => <Text variant="strong" tone={unread ? "ink" : "muted"}>{kids}</Text> });
  const at = new Date(n.createdAt);
  const when = relativeTime(at.getTime(), Date.now(), locale);
  return (
    <View role="listitem">
    <Link href={noticeHref(n, href) as Href} asChild>
      <Pressable
        role="link"
        testID={`notice-${n.id}`}
        style={StyleSheet.flatten([{ minHeight: control, flexDirection: "row", gap: space.sm, alignItems: "center", paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }, web({ cursor: "pointer" })])}
      >
        {/* unread: ink text (read is muted, as in v1) and a named, invisible mark first in the link, so its name starts with "Non letta" */}
        {unread ? <View role="img" aria-label={t("diary.notif.unreadOne")} style={{ width: 1, height: 1 }} /> : null}
        <Avatar name={name} image={n.actor?.image} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text tone={unread ? "ink" : "muted"} style={web({ overflowWrap: "anywhere" })}>{sentence}</Text>
          {n.circleName ? <Text variant="small" tone="muted">{n.circleName}</Text> : null}
        </View>
        <Text variant="small" tone="muted" accessibilityLabel={new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at)} style={web({ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" })}>
          {when}
        </Text>
      </Pressable>
    </Link>
    </View>
  );
}

function NotificationsBody() {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const me = useMe();
  const { reload: reloadMe } = useSession();
  const [circle, setCircle] = useState("");
  const inbox = usePages((before, signal) => diaryApi.notifications({ circle: circle || undefined, before, locale }, signal), [circle, locale]);
  // v1: opening the inbox reads everything (after the list is out, so a GET stays free of side effects). What was unread on arrival stays
  // drawn as unread for this visit, filters included; the badge and the next visit see it read.
  const fresh = useRef(new Set<string>());
  const [, bump] = useState(0);
  const autoRead = useRef(false);
  useEffect(() => {
    let added = false;
    for (const n of inbox.items) if (!n.read && !fresh.current.has(n.id)) {
      fresh.current.add(n.id);
      added = true;
    }
    if (added) bump((x) => x + 1);
    if (autoRead.current || inbox.status !== "ready") return;
    autoRead.current = true;
    if (inbox.items.some((n) => !n.read) || me.circles.some((c) => c.unread > 0)) void diaryApi.markRead().then(() => reloadMe(), () => undefined);
  }, [inbox.items, inbox.status, me.circles, reloadMe]);
  return (
    <Screen onRefresh={() => void inbox.reload()} refreshing={inbox.status === "loading" && inbox.items.length > 0} onNearEnd={() => void inbox.loadMore()}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Chevron dir="left" color={c.ink2} />
        <TextLink href={href("/home")} tone="ink2">{t("app.circle.back")}</TextLink>
      </View>
      <Heading level={1}>{t("notifications.title")}</Heading>
      {me.circles.length > 1 ? (
        <Choice label={t("diary.notif.filter")} value={circle} onChange={setCircle} options={[{ value: "", label: t("feed.filter.any") }, ...me.circles.map((c) => ({ value: c.id, label: c.name }))]} />
      ) : null}
      {inbox.status === "loading" ? <Loading rows={4} /> : null}
      {inbox.status === "error" ? <ErrorState error={inbox.error} onRetry={inbox.reload} /> : null}
      {inbox.status === "ready" && inbox.items.length === 0 ? <Empty title={t("notifications.empty")} /> : null}
      {inbox.items.length > 0 ? (
        <View role="list" style={{ borderTopWidth: hair }}>
          {inbox.items.map((n) => (
            <Notice key={n.id} n={n} unread={!n.read || fresh.current.has(n.id)} />
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
