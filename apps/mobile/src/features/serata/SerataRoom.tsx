import type { RoomView, SerataPublicResult } from "@pausa/api-types";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { ApiFailure, errorMessage } from "@/api/errors";
import { serataApi, GUEST_AVATARS } from "@/api/serata";
import { setToken } from "@/api/token";
import { useAction } from "@/api/useAction";
import { useSession } from "@/features/session";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { Screen } from "@/ui/Screen";
import { Empty, ErrorState, Loading, Notice } from "@/ui/Status";
import { Arrive } from "@/ui/motion";
import { Heading, Text } from "@/ui/Text";
import { Bracket, Lobby, People, Table } from "./RoomPhases";
import { RoomResult } from "./RoomResult";
import { ShareCardSheet } from "./ShareCardSheet";
import { codeFrom, withBallot, withPick } from "./room-logic";
import "./serata.messages";
import { useRoom, type Connection } from "./useRoom";

/**
 * `/{locale}/s/{code}`: the room of one Serata. Reachable without an account: a person with no session joins as a guest (a name and a
 * picture; the server makes an anonymous account), a signed-in person who is not in yet joins with one press. Everything after
 * that is `Room`, which keeps the view live (WebSocket, polling as the fallback) and shows the screen for the room's status.
 */
export function SerataRoom() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = codeFrom(String(raw ?? ""));
  const { state, reload } = useSession();
  const { t } = useI18n();
  if (state.status === "loading")
    return (
      <Screen width={560}>
        <Loading />
      </Screen>
    );
  if (state.status === "error")
    return (
      <Screen width={560}>
        <ErrorState error={state.error} onRetry={reload} />
      </Screen>
    );
  if (!code)
    return (
      <Screen width={560}>
        <Empty title={t("serataApp.room.notFound")} />
      </Screen>
    );
  if (state.status === "anonymous") return <GuestEntry code={code} />;
  return <Room code={code} isGuest={state.me.isAnonymous} meId={state.me.id} />;
}

function PickAvatar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ gap: space["2xs"] }}>
      <Text variant="label" tone="ink2">{t("serata.join.avatar")}</Text>
      <View role="radiogroup" aria-label={t("serata.join.avatar")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {GUEST_AVATARS.map((a) => (
          <Pressable
            key={a}
            role="radio"
            aria-checked={value === a}
            aria-label={a}
            onPress={() => onChange(a)}
            style={[{ width: control, height: control, alignItems: "center", justifyContent: "center", borderWidth: value === a ? 2 : hair, borderColor: value === a ? c.accent : c.rule, backgroundColor: value === a ? c.paper3 : "transparent" }, web({ cursor: "pointer" })]}
          >
            <Text style={{ fontSize: 24, lineHeight: 30 }} aria-hidden>{a}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** No session: if the Serata is already over its result is public (shown with the card); otherwise the guest door. */
function GuestEntry({ code }: { code: string }) {
  const { t, href, locale } = useI18n();
  const { reload } = useSession();
  const [pub, setPub] = useState<{ state: "loading" } | { state: "open" } | { state: "done"; result: SerataPublicResult }>({ state: "loading" });
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(GUEST_AVATARS[0]);
  const [card, setCard] = useState(false);
  const join = useAction();

  useEffect(() => {
    const ctl = new AbortController();
    serataApi.publicResult(code, ctl.signal).then(
      (result) => setPub({ state: "done", result }),
      () => setPub({ state: "open" }),
    );
    return () => ctl.abort();
  }, [code]);

  const enter = async () => {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    const ok = await join.run(async () => {
      const g = await serataApi.guest(clean, Platform.OS !== "web");
      if ("token" in g) await setToken(g.token); // native: the Bearer token; web: the server set the cookie
      await serataApi.join(code, { name: clean, avatar });
    });
    if (ok) await reload();
  };

  if (pub.state === "loading")
    return (
      <Screen width={560}>
        <Loading rows={2} />
      </Screen>
    );
  if (pub.state === "done") {
    const r = pub.result;
    return (
      <Screen width={560}>
        <Text variant="label" tone="accent" style={{ letterSpacing: 2 }}>{t("serata.result.kicker")}</Text>
        <Heading level={1} testID="public-winner" style={{ fontSize: 48, lineHeight: 52 }}>{r.winner.title}</Heading>
        <Text tone="ink2">{t("serata.result.subtitle")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          <Button label={t("serata.result.share")} onPress={() => setCard(true)} />
          <Button label={t("serata.result.ctaButton")} variant="secondary" href={`${href("/sign-in")}?next=${encodeURIComponent(`/${locale}/home`)}`} />
        </View>
        <Text variant="small" tone="muted">{t("serata.result.cta")}</Text>
        <ShareCardSheet code={code} open={card} onClose={() => setCard(false)} />
      </Screen>
    );
  }
  return (
    <Screen width={560}>
      <Heading level={1}>{t("serata.join.title")}</Heading>
      <Text variant="lead" tone="ink2">{t("serata.join.bodyGuest")}</Text>
      <Field label={t("serata.join.name")} value={name} onChangeText={(v) => setName(v.slice(0, 24))} maxLength={24} autoComplete="name" returnKeyType="go" onSubmitEditing={enter} testID="guest-name" />
      <PickAvatar value={avatar} onChange={setAvatar} />
      {join.error ? (
        <Text role="alert" tone="error">
          {join.error instanceof ApiFailure && join.error.code === "conflict" ? t("serataApp.gate.started") : errorMessage(t, join.error)}
        </Text>
      ) : null}
      <Button label={t("serata.join.cta")} onPress={enter} busy={join.busy} disabled={!name.trim()} fullWidth testID="guest-join" />
      <Text variant="small" tone="muted">{t("serataApp.gate.code", { code })}</Text>
    </Screen>
  );
}

function ConnectionNote({ connection }: { connection: Connection }) {
  const { t } = useI18n();
  if (connection === "live") return null;
  return (
    <View role="status" aria-live="polite" testID="connection-note">
      <Text variant="small" tone="muted">
        {connection === "polling" ? t("serataApp.room.polling") : t("serataApp.room.connecting")}
      </Text>
    </View>
  );
}

function Room({ code, isGuest, meId }: { code: string; isGuest: boolean; meId: string }) {
  const { t, href, locale } = useI18n();
  const room = useRoom(code, true);
  const { view, error, connection, offset } = room;
  const act = useAction();
  const [vote, setVote] = useState<{ error: unknown } | null>(null);
  const [left, setLeft] = useState(false);

  const optimistic = useCallback(
    async (make: (v: RoomView) => RoomView, call: () => Promise<RoomView>) => {
      const before = view;
      if (!before) return;
      room.preview(make(before));
      setVote(null);
      try {
        room.accept(await call());
      } catch (e) {
        room.rollback(before);
        setVote({ error: e });
      }
    },
    [room, view],
  );

  if (left) return <Redirect href={(view?.circleId && !isGuest ? href(`/c/${view.circleId}/serate`) : href("/home")) as never} />;
  if (error && !view)
    return (
      <Screen width={560}>
        <Heading level={1}>{t("serata.title")}</Heading>
        {error instanceof ApiFailure && error.code === "not_found" ? <Empty title={t("serataApp.room.notFound")} body={t("serataApp.room.notFoundBody")} /> : <ErrorState error={error} onRetry={room.refresh} />}
        <Button label={t("errors.home")} variant="secondary" href={href("/home")} />
      </Screen>
    );
  if (!view)
    return (
      <Screen width={560}>
        <Loading rows={4} />
      </Screen>
    );

  const joinNow = async () => {
    const res = await act.run(() => serataApi.join(code));
    if (res) room.accept(res.value);
  };
  const leave = async () => {
    if (await act.run(() => serataApi.leave(code))) setLeft(true);
  };
  const start = async () => {
    const res = await act.run(() => serataApi.start(code));
    if (res) room.accept(res.value);
  };
  const force = async () => {
    const res = await act.run(() => serataApi.force(code));
    if (res) room.accept(res.value);
  };

  const status = view.status;
  const voting = status === "voting";
  const inRoom = view.joined;

  let phase: React.ReactNode;
  if (status === "done" && view.result) phase = <RoomResult view={view} isGuest={isGuest} signInNext={`/${locale}/s/${code}`} />;
  else if (status === "expired") phase = <Empty title={t("serataApp.room.expired")} body={t("serataApp.room.expiredBody")} />;
  else if (!inRoom && status === "lobby")
    phase = (
      <View style={{ gap: space.md }}>
        <Text variant="lead" tone="ink2">{t("serata.join.bodyMember")}</Text>
        <Text tone="ink2">{t("serata.lobby.rosa", { count: view.candidates.length })}: {view.candidates.map((c) => c.title).join(", ")}</Text>
        <Button label={t("serata.join.cta")} onPress={joinNow} busy={act.busy} testID="join" />
      </View>
    );
  else if (!inRoom) phase = <Empty title={t("serataApp.gate.started")} />;
  else if (status === "lobby") phase = <Lobby view={view} onStart={start} busy={act.busy} />;
  else if (voting && view.bracket)
    phase = (
      <Bracket
        view={view}
        offset={offset}
        busy={act.busy}
        onForce={force}
        onOverdue={() => void room.refresh()}
        onVote={(id) => void optimistic((v) => withPick(v, meId, id), () => serataApi.vote(code, id))}
      />
    );
  else if (voting && view.table)
    phase = (
      <Table
        view={view}
        offset={offset}
        busy={act.busy}
        onForce={force}
        onOverdue={() => void room.refresh()}
        onSubmit={(b) => void optimistic((v) => withBallot(v, meId, b), () => serataApi.ballot(code, b))}
      />
    );
  else phase = <Loading rows={2} />;

  // The phase key restarts the arrival fade when the screen changes (a new round, the result); reduced motion shows it at once.
  const phaseKey = `${status}-${view.bracket ? `${view.bracket.roundName}-${view.bracket.done}` : ""}`;

  return (
    <Screen width={640}>
      <View style={{ gap: space["2xs"] }}>
        <Heading level={1} style={{ fontSize: 44, lineHeight: 48 }}>{t("serata.title")}</Heading>
        <Text variant="small" tone="muted">
          {t(`serata.mode.${view.mode}`)} · {status === "lobby" ? t("serata.status.lobby") : status === "voting" ? t("serata.status.voting") : status === "done" ? t("serataApp.room.finished") : t("serataApp.room.expiredShort")}
        </Text>
        <ConnectionNote connection={connection} />
      </View>
      <Arrive key={phaseKey}>{phase}</Arrive>
      {vote ? <Text role="alert" tone="error" testID="vote-error">{errorMessage(t, vote.error)}</Text> : null}
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}
      {inRoom && status !== "lobby" && status !== "done" && status !== "expired" ? <People view={view} showVotes={voting} /> : null}
      {inRoom && (status === "lobby" || voting) ? (
        <Button label={t("serataApp.room.leave")} variant="quiet" onPress={leave} busy={act.busy} testID="leave" accessibilityLabel={t("serataApp.room.leaveLabel")} />
      ) : null}
      {status === "done" && !view.result ? <Notice tone="ink2">{t("serataApp.room.finished")}</Notice> : null}
    </Screen>
  );
}
