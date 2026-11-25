import type { CommentDto, LogDto, LogThread, ReactionCount } from "@pausa/api-types";
import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi, REACTIONS, REPORT_REASONS, type ReportReason } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Sheet } from "@/ui/Sheet";
import { Stars } from "@/ui/Stars";
import { Toggle } from "@/ui/Toggle";
import { Empty, ErrorState, Heading, Loading, Notice, Screen, Tag, Text, Title } from "@/ui";
import { RequireSession, useMe } from "../session";
import { KindTag, num, REACTION_NAME, useCircleScope, useEpisodeLabel, ymdToMs } from "./shared";
import "./diary.messages";

const MAX_COMMENT = 2000;
const MAX_NOTE = 500;

type Target = { kind: "log" | "comment"; id: string } | null;

function ReportSheet({ target, onClose }: { target: Target; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const act = useAction();
  useEffect(() => {
    setSent(false);
    setNote("");
    setReason("abuse");
  }, [target?.id]);
  return (
    <Sheet title={t("manage.report.button")} open={target !== null} onClose={onClose}>
      {sent ? (
        <>
          <Notice>{t("manage.report.thanks")}</Notice>
          <Button label={t("app.close")} variant="secondary" onPress={onClose} />
        </>
      ) : (
        <>
          <Choice<ReportReason> label={t("manage.report.reason")} value={reason} onChange={setReason} options={REPORT_REASONS.map((r) => ({ value: r, label: t(`manage.report.reasons.${r}`) }))} />
          <Field label={t("manage.report.note")} value={note} onChangeText={setNote} multiline maxLength={MAX_NOTE} hint={`${note.length}/${MAX_NOTE}`} />
          <Button
            label={t("manage.report.send")}
            busy={act.busy}
            onPress={async () => {
              if (target && (await act.run(() => diaryApi.report({ kind: target.kind, targetId: target.id, reason, note: note.trim() || undefined })))) setSent(true);
            }}
          />
          {act.error ? (
            <Text tone="error" role="alert">
              {errorMessage(t, act.error)}
            </Text>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/** The five reactions: each a toggle, counted, flipped at once and put back if the server says no. */
function Reactions({ circleId, logId, initial }: { circleId: string; logId: string; initial: ReactionCount[] }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [state, setState] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setState(initial), [initial]);
  const toggle = async (emoji: string) => {
    const before = state;
    const cur = before.find((r) => r.emoji === emoji);
    const on = !cur?.mine;
    const next = cur
      ? before.map((r) => (r.emoji === emoji ? { ...r, mine: on, count: Math.max(0, r.count + (on ? 1 : -1)) } : r))
      : [...before, { emoji, mine: true, count: 1 }];
    setState(next);
    setError(null);
    try {
      await diaryApi.react(circleId, logId, emoji);
    } catch (e) {
      setState(before);
      setError(e);
    }
  };
  return (
    <View style={{ gap: space.xs }}>
      <View role="group" aria-label={t("diary.thread.reactions")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {REACTIONS.map((emoji) => {
          const r = state.find((x) => x.emoji === emoji);
          const mine = !!r?.mine;
          const name = t(REACTION_NAME[emoji]);
          return (
            <Pressable
              key={emoji}
              role="button"
              aria-pressed={mine}
              aria-label={`${t("feed.react", { emoji: name })}${r?.count ? `, ${t("feed.reactCount", { name, count: r.count })}` : ""}`}
              testID={`react-${emoji}`}
              onPress={() => void toggle(emoji)}
              style={StyleSheet.flatten([
                { minHeight: control, minWidth: control, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space["2xs"], borderWidth: hair, borderColor: mine ? c.accent : c.rule, backgroundColor: mine ? c.paper3 : "transparent" },
                web({ cursor: "pointer" }),
              ])}
            >
              <Text aria-hidden style={{ fontSize: 20 }}>
                {emoji}
              </Text>
              {r?.count ? (
                <Text aria-hidden variant="small" tone={mine ? "ink" : "ink2"}>
                  {r.count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, error)}
        </Text>
      ) : null}
    </View>
  );
}

function Composer({ circleId, logId, replyTo, onCancelReply, onSent }: { circleId: string; logId: string; replyTo: CommentDto | null; onCancelReply: () => void; onSent: () => void }) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const act = useAction();
  const text = body.trim();
  return (
    <View style={{ gap: space.sm }}>
      {replyTo ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
          <Tag tone="accent" label={t("diary.thread.replyingTo", { name: replyTo.author.name })} />
          <Button label={t("app.cancel")} variant="quiet" onPress={onCancelReply} />
        </View>
      ) : null}
      <Field label={replyTo ? t("diary.thread.replyLabel") : t("comments.placeholder")} value={body} onChangeText={setBody} multiline maxLength={MAX_COMMENT} hint={`${body.length}/${MAX_COMMENT}`} testID="composer-input" />
      <Toggle label={t("comments.spoiler")} value={spoiler} onChange={setSpoiler} />
      <Button
        label={t("comments.send")}
        busy={act.busy}
        disabled={text === ""}
        testID="composer-send"
        onPress={async () => {
          if (await act.run(() => diaryApi.addComment(circleId, logId, { body: text, isSpoiler: spoiler, parentId: replyTo?.id ?? null }))) {
            setBody("");
            setSpoiler(false);
            onCancelReply();
            onSent();
          }
        }}
      />
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Comment({ comment, canDelete, shown, body, onReveal, onReply, onReport, onChanged, reply }: {
  comment: CommentDto;
  canDelete: boolean;
  shown: boolean;
  body: string | null;
  onReveal: () => void;
  onReply?: () => void;
  onReport: () => void;
  onChanged: () => void;
  reply?: boolean;
}) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body ?? "");
  const [spoiler, setSpoiler] = useState(comment.isSpoiler);
  const save = useAction();
  const del = useAction();
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt)), [locale, comment.createdAt]);
  const gated = comment.isSpoiler && !comment.mine && !shown;
  return (
    <View testID={`comment-${comment.id}`} style={{ marginLeft: reply ? space.lg : 0, paddingVertical: space.sm, gap: space.xs, borderBottomWidth: hair, borderColor: c.rule }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Avatar name={comment.author.name} image={comment.author.image} size={28} />
        <Text variant="strong" style={{ flexShrink: 1 }}>
          {comment.author.name}
        </Text>
        <Text variant="small" tone="muted">
          {when}
        </Text>
        {comment.isSpoiler ? <Tag label="spoiler" /> : null}
      </View>
      {editing ? (
        <View style={{ gap: space.sm }}>
          <Field label={t("diary.thread.editComment")} value={draft} onChangeText={setDraft} multiline maxLength={MAX_COMMENT} hint={`${draft.length}/${MAX_COMMENT}`} />
          <Toggle label={t("comments.spoiler")} value={spoiler} onChange={setSpoiler} />
          <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
            <Button
              label={t("manage.saveChanges")}
              busy={save.busy}
              disabled={draft.trim() === ""}
              onPress={async () => {
                if (await save.run(() => diaryApi.editComment(comment.id, { body: draft.trim(), isSpoiler: spoiler }))) {
                  setEditing(false);
                  onChanged();
                }
              }}
            />
            <Button label={t("app.cancel")} variant="quiet" onPress={() => setEditing(false)} />
          </View>
          {save.error ? (
            <Text tone="error" role="alert">
              {errorMessage(t, save.error)}
            </Text>
          ) : null}
        </View>
      ) : gated ? (
        <Pressable role="button" aria-label={t("feed.commentSpoiler")} onPress={onReveal} style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center", paddingHorizontal: space.sm, borderWidth: hair, borderColor: c.rule, backgroundColor: c.paper2 }, web({ cursor: "pointer" })])}>
          <Text variant="small" tone="ink2">
            {t("feed.commentSpoiler")}
          </Text>
        </Pressable>
      ) : (
        <Text selectable>{body ?? ""}</Text>
      )}
      {!editing ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {onReply ? <Button label={t("diary.thread.reply")} accessibilityLabel={t("diary.thread.replyTo", { name: comment.author.name })} variant="quiet" onPress={onReply} /> : null}
          {comment.mine ? (
            <Button
              label={t("manage.edit")}
              variant="quiet"
              onPress={() => {
                setDraft(body ?? "");
                setSpoiler(comment.isSpoiler);
                setEditing(true);
              }}
            />
          ) : null}
          {canDelete ? (
            <ConfirmButton
              label={t("manage.delete")}
              confirmLabel={t("manage.deleteConfirm")}
              busy={del.busy}
              onConfirm={async () => {
                if (await del.run(() => diaryApi.deleteComment(comment.id))) onChanged();
              }}
            />
          ) : null}
          {!comment.mine ? <Button label={t("manage.report.button")} variant="quiet" onPress={onReport} /> : null}
        </View>
      ) : null}
      {del.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, del.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Header({ log, circleId, watchedWith, revealed, onReveal, mine, onReport }: { log: LogDto; circleId: string; watchedWith: LogThread["watchedWith"]; revealed: boolean; onReveal: () => void; mine: boolean; onReport: () => void }) {
  const { t, href, date } = useI18n();
  const router = useRouter();
  const epLabel = useEpisodeLabel();
  const del = useAction();
  const ep = epLabel(num(log.season), num(log.episode));
  const year = num(log.media.year);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Link href={href(`/t/${log.media.id}`) as Href}>
          <MediaPoster title={log.media.title} path={log.media.posterPath} width={96} decorative={false} />
        </Link>
        <View style={{ flex: 1, gap: space.xs }}>
          <Heading level={1} style={{ fontSize: 40, lineHeight: 44 }}>
            {log.media.title}
          </Heading>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
            {year ? (
              <Text variant="small" tone="muted">
                {year}
              </Text>
            ) : null}
            <KindTag media={log.media} />
            {log.isRewatch ? <Tag label={t("feed.rewatched")} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Avatar name={log.author.name} image={log.author.image} size={24} />
            <Link href={href(`/c/${circleId}/people/${log.author.id}`) as Href} asChild>
              <Pressable role="link" style={StyleSheet.flatten([{ flexShrink: 1, minHeight: control, justifyContent: "center" }, web({ cursor: "pointer" })])}>
                <Text variant="strong">{log.author.name}</Text>
              </Pressable>
            </Link>
          </View>
          <Text variant="small" tone="muted">
            {[date(ymdToMs(log.watchedOn)), ep, log.platform ? t("feed.on", { platform: log.platform }) : null].filter(Boolean).join(" · ")}
          </Text>
          <Stars halves={log.rating} size={20} />
        </View>
      </View>
      {log.reviewHidden && !revealed ? (
        <Pressable role="button" testID="reveal-review" onPress={onReveal} style={StyleSheet.flatten([{ minHeight: control, justifyContent: "center", paddingHorizontal: space.sm, borderWidth: hair, borderColor: "transparent", backgroundColor: "transparent" }, web({ cursor: "pointer" })])}>
          <Text tone="ink2">{t("feed.spoiler")}</Text>
          <Text variant="strong" tone="accent">
            {t("diary.thread.show")}
          </Text>
        </Pressable>
      ) : log.review ? (
        <Text selectable testID="review">
          {log.review}
        </Text>
      ) : null}
      {watchedWith.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
          <Text variant="label" tone="ink2">
            {t("feed.with")}
          </Text>
          {watchedWith.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: space["2xs"] }}>
              <Avatar name={p.name} image={p.image} size={22} />
              <Text variant="small">{p.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {mine ? (
          <>
            <Button label={t("manage.edit")} variant="secondary" href={href(`/log/${log.id}`)} />
            <ConfirmButton
              label={t("manage.delete")}
              confirmLabel={t("manage.deleteConfirm")}
              busy={del.busy}
              onConfirm={async () => {
                if (await del.run(() => diaryApi.deleteLog(log.id))) router.replace(href(`/c/${circleId}/feed`) as never);
              }}
            />
          </>
        ) : (
          <Button label={t("manage.report.button")} variant="quiet" onPress={onReport} />
        )}
      </View>
      {mine ? <Text variant="small" tone="muted">{t("manage.deleteLogWarn")}</Text> : null}
      {del.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, del.error)}
        </Text>
      ) : null}
    </View>
  );
}

function ThreadBody({ circleId, logId, reveal }: { circleId: string; logId: string; reveal: boolean }) {
  const { t, href, locale } = useI18n();
  const me = useMe();
  useCircleScope(circleId);
  const [revealed, setRevealed] = useState(reveal);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const [report, setReport] = useState<Target>(null);
  const thread = useResource((signal) => diaryApi.thread(circleId, logId, { reveal: revealed, locale }, signal), [circleId, logId, revealed, locale]);
  const back = (
    <BackLink to={href(`/c/${circleId}/feed`)} label={t("diary.thread.back")} />
  );
  if (thread.loading && !thread.data)
    return (
      <Screen>
        {back}
        <Loading rows={4} />
      </Screen>
    );
  if (thread.error || !thread.data)
    return (
      <Screen>
        {back}
        <ErrorState error={thread.error} onRetry={thread.reload} />
      </Screen>
    );
  const { log, comments, watchedWith } = thread.data;
  const mine = log.author.id === me.id;
  const top = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const revealComment = async (c: CommentDto) => {
    let body = c.body;
    if (body === null) {
      try {
        const full = await diaryApi.thread(circleId, logId, { reveal: true, locale });
        body = full.comments.find((x) => x.id === c.id)?.body ?? null;
      } catch {
        return;
      }
      if (body !== null) setBodies((b) => ({ ...b, [c.id]: body as string }));
    }
    setShown((s) => new Set(s).add(c.id));
  };
  const item = (c: CommentDto, reply: boolean) => (
    <Comment
      key={c.id}
      comment={c}
      reply={reply}
      canDelete={c.mine || mine}
      shown={shown.has(c.id)}
      body={c.body ?? bodies[c.id] ?? null}
      onReveal={() => void revealComment(c)}
      onReply={reply ? undefined : () => setReplyTo(c)}
      onReport={() => setReport({ kind: "comment", id: c.id })}
      onChanged={() => void thread.reload()}
    />
  );
  return (
    <Screen>
      {back}
      <Header log={log} circleId={circleId} watchedWith={watchedWith} revealed={revealed} onReveal={() => setRevealed(true)} mine={mine} onReport={() => setReport({ kind: "log", id: log.id })} />
      <Reactions circleId={circleId} logId={logId} initial={log.reactions} />
      <View style={{ gap: space.xs }}>
        <Title>{t("comments.title")}</Title>
        {comments.length === 0 ? (
          <Text tone="muted">{t("comments.empty")}</Text>
        ) : (
          <View role="list">
            {top.map((c) => (
              <View key={c.id} role="listitem">
                {item(c, false)}
                {repliesOf(c.id).map((r) => item(r, true))}
              </View>
            ))}
          </View>
        )}
      </View>
      <Composer circleId={circleId} logId={logId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => void thread.reload()} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  );
}

export function Thread() {
  const { id, logId, reveal } = useLocalSearchParams<{ id: string; logId: string; reveal?: string }>();
  return (
    <RequireSession>
      <ThreadBody circleId={String(id)} logId={String(logId)} reveal={reveal === "1"} />
    </RequireSession>
  );
}
