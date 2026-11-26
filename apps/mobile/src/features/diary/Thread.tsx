import type { CommentDto, LogDto, LogThread } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ApiFailure, errorMessage } from "@/api/errors";
import { diaryApi, REPORT_REASONS, type ReportReason } from "@/api/diary";
import { listsApi, LIST_CAP } from "@/api/lists";
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
import { Select } from "@/ui/Select";
import { Sheet } from "@/ui/Sheet";
import { Toggle } from "@/ui/Toggle";
import { Empty, ErrorState, Heading, Loading, Notice, Screen, Tag, Text, Title } from "@/ui";
import { RequireSession, useMe } from "../session";
import { relativeTime } from "./dates";
import { CardList, LogCard, useCircleScope } from "./shared";
import "../lists/lists.messages";
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
  const when = useMemo(() => relativeTime(Number(comment.createdAt), Date.now(), locale), [locale, comment.createdAt]);
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

/** v1 "Aggiungi a una lista": the Cerchia's lists and my own, one select and a button. Hidden when there is none. */
function AddToList({ circleId, mediaId }: { circleId: string; mediaId: string }) {
  const { t } = useI18n();
  const lists = useResource((signal) => listsApi.overview(circleId, signal), [circleId]);
  const [listId, setListId] = useState("");
  const [state, setState] = useState<"added" | "already" | null>(null);
  const add = useAction();
  const targets = lists.data ?? [];
  if (targets.length === 0) return null;
  const failure = add.error instanceof ApiFailure && add.error.code === "conflict" ? t("listsApp.full", { max: LIST_CAP }) : add.error ? errorMessage(t, add.error) : null;
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
        <Select<string>
          label={t("lists.addTo")}
          value={listId}
          testID="add-to-list"
          onChange={(v) => {
            setListId(v);
            setState(null);
          }}
          options={[{ value: "", label: t("lists.addTo") }, ...targets.map((l) => ({ value: l.id, label: l.circleId === null ? `${l.name} (${t("lists.personal")})` : l.name }))]}
        />
        <Button
          label={state === "added" ? t("listsApp.addedShort") : state === "already" ? t("listsApp.alreadyShort") : t("lists.add")}
          disabled={listId === "" || state !== null}
          busy={add.busy}
          testID="add-to-list-go"
          style={{ minHeight: control }}
          onPress={async () => {
            const res = await add.run(() => listsApi.addItem(listId, { mediaId }));
            if (res) setState(res.value.added ? "added" : "already");
          }}
        />
      </View>
      {failure ? (
        <Text tone="error" role="alert">
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

/** Under the card: edit (inside this Cerchia) and delete for the author, report for anyone else. */
function Actions({ log, circleId, mine, onReport }: { log: LogDto; circleId: string; mine: boolean; onReport: () => void }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const del = useAction();
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {mine ? (
          <>
            <Button label={t("manage.edit")} variant="secondary" href={href(`/c/${circleId}/log/${log.id}/edit`)} />
            <ConfirmButton
              label={t("manage.delete")}
              confirmLabel={t("manage.deleteConfirm")}
              busy={del.busy}
              onConfirm={async () => {
                if (await del.run(() => diaryApi.deleteLog(log.id))) router.replace(href(`/c/${circleId}`) as never);
              }}
            />
          </>
        ) : (
          <Button label={t("manage.report.button")} variant="quiet" onPress={onReport} />
        )}
      </View>
      {mine ? (
        <Text variant="small" tone="muted">
          {t("manage.deleteLogWarn")}
        </Text>
      ) : null}
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
    const [shown, setShown] = useState<Set<string>>(new Set());
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const [report, setReport] = useState<Target>(null);
  const thread = useResource((signal) => diaryApi.thread(circleId, logId, { reveal, locale }, signal), [circleId, logId, reveal, locale]);
  const back = (
    <BackLink to={href(`/c/${circleId}`)} label={t("diary.thread.back")} />
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
      <Heading level={1} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {log.media.title}
      </Heading>
      <CardList>
        <LogCard log={{ ...log, watchedWith }} circleId={circleId} onThread />
      </CardList>
      <Actions log={log} circleId={circleId} mine={mine} onReport={() => setReport({ kind: "log", id: log.id })} />
      <AddToList circleId={circleId} mediaId={log.media.id} />
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
