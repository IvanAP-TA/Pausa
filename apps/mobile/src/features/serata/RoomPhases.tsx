import type { Candidate, RoomView } from "@pausa/api-types";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Share, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { siteOrigin } from "@/features/circle-links";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { Countdown } from "./Countdown";
import { ballotProblem, cleanBallot, dotsLeft, matchNumber, matchPair, roomLink } from "./room-logic";
import "./serata.messages";

export const yearOf = (c: Pick<Candidate, "year">) => (c.year === null ? "" : String(Number(c.year)));

/** Who is in the room: a face, a name, and whether they have voted in this round (never what). */
export function People({ view, showVotes }: { view: RoomView; showVotes: boolean }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2" role="heading" aria-level={2}>
        {t("serata.inRoom", { count: view.participants.length })}
      </Text>
      <RowList>
        {view.participants.map((p) => (
          <Row key={p.id} testID={`person-${p.name}`}>
            <Avatar name={p.name} image={p.image} size={32} />
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {p.name}
              {p.isGuest ? <Text tone="muted"> · {t("serata.guest")}</Text> : null}
            </Text>
            {showVotes ? (
              <Text variant="small" tone={p.voted ? "success" : "muted"}>
                {p.voted ? `✓ ${t("serata.voted")}` : t("serata.choosing")}
              </Text>
            ) : null}
          </Row>
        ))}
      </RowList>
    </View>
  );
}

/** The candidates in seed order, before the start: "rosa". */
function Roster({ view }: { view: RoomView }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2" role="heading" aria-level={2}>
        {t("serata.lobby.rosa", { count: view.candidates.length })}
      </Text>
      <RowList>
        {view.candidates.map((c, i) => (
          <Row key={c.id}>
            <Text tone="muted" style={{ width: 24 }}>{i + 1}</Text>
            <MediaPoster title={c.title} path={c.posterPath} width={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="strong" numberOfLines={2}>{c.title}</Text>
              <Text variant="small" tone="muted">{yearOf(c)}</Text>
            </View>
          </Row>
        ))}
      </RowList>
    </View>
  );
}

export function Lobby({ view, onStart, busy }: { view: RoomView; onStart: () => void; busy: boolean }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  // The view does not name the host; the room hands itself to the longest-seated person, who is listed first.
  const host = view.participants[0];
  const link = roomLink(siteOrigin(), locale, view.code);
  const share = async () => {
    const text = `${t("serata.lobby.shareText")} ${link}`;
    if (Platform.OS !== "web") {
      await Share.share({ message: text }).catch(() => undefined);
      return;
    }
    await Clipboard.setStringAsync(link);
    setCopied(true);
  };
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="ink2">{t("serataApp.lobby.code")}</Text>
        <Text testID="room-code" selectable style={{ fontSize: 44, lineHeight: 50, letterSpacing: 6, color: c.accent, fontFamily: "SofiaSansExtraCondensed_400" }} accessibilityLabel={view.code.split("").join(" ")}>
          {view.code}
        </Text>
        <Text tone="ink2">{t("serata.lobby.invite")}</Text>
        <Button label={t("serata.lobby.share")} variant="secondary" onPress={share} />
        {copied ? <Notice>{t("serata.lobby.copied")}</Notice> : null}
      </View>
      <Roster view={view} />
      <People view={view} showVotes={false} />
      {view.isHost ? (
        <View style={{ gap: space.xs }}>
          <Button label={t("serata.lobby.start")} onPress={onStart} busy={busy} fullWidth testID="start" />
          <Text variant="small" tone="muted">{t("serataApp.lobby.startHint")}</Text>
        </View>
      ) : (
        <Text tone="ink2" role="status">{t("serata.lobby.wait", { name: host?.name ?? "" })}</Text>
      )}
    </View>
  );
}

/** One of the two titles of a match: big, the whole card is the target; the chosen one is marked by a frame AND by words. */
function Option({ cand, picked, dimmed, onPress }: { cand: Candidate; picked: boolean; dimmed: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const poster = Math.max(96, Math.min(170, Math.floor((Math.min(width, 720) - 32 - space.sm) / 2) - 2 * space.sm - 6));
  return (
    <Pressable
      role="radio"
      aria-checked={picked}
      aria-label={`${cand.title}${yearOf(cand) ? `, ${yearOf(cand)}` : ""}${picked ? `, ✓ ${t("serataApp.bracket.yours")}` : ""}`}
      onPress={onPress}
      testID={`option-${cand.id}`}
      style={[
        { flex: 1, minHeight: control, padding: space.sm, gap: space.sm, alignItems: "center", borderWidth: 3, borderColor: picked ? c.accent : c.rule, backgroundColor: "transparent" }, // the picked one is marked by the accent frame and the "yours" tag; not dimmed with opacity: that took the muted year under 4.5:1
        dimmed ? { borderStyle: "dashed" } : null,
        web({ cursor: "pointer" }),
      ]}
    >
      <MediaPoster title={cand.title} path={cand.posterPath} width={poster} size="w342" />
      <Text variant="strong" numberOfLines={3} style={{ textAlign: "center" }}>{cand.title}</Text>
      {yearOf(cand) ? <Text variant="small" tone="muted">{yearOf(cand)}</Text> : null}
      {picked ? <Tag tone="accent" label={`✓ ${t("serataApp.bracket.yours")}`} /> : null}
    </Pressable>
  );
}

export function Bracket({ view, offset, onVote, onForce, onOverdue, busy }: { view: RoomView; offset: number; onVote: (mediaId: string) => void; onForce: () => void; onOverdue: () => void; busy: boolean }) {
  const { t } = useI18n();
  const b = view.bracket;
  const pair = matchPair(view);
  if (!b || !pair) return null;
  const m = matchNumber(b);
  const voted = view.participants.filter((p) => p.voted).length;
  const round = t(`serata.round.${b.roundName as "final" | "semi" | "quarter"}`);
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="strong" testID="round-name" role="status">
          {round} · {t("serata.match", { n: m.n, total: m.total })}
        </Text>
        {b.deadline !== null ? <Countdown key={b.deadline} deadline={b.deadline} offset={offset} onOverdue={onOverdue} /> : null}
        <Text role="status" variant="small" tone="muted" testID="voted-count">{t("serataApp.room.votedCount", { voted, total: view.participants.length })}</Text>
      </View>
      <View role="radiogroup" aria-label={t("serata.pick")} style={{ flexDirection: "row", gap: space.sm }}>
        <Option cand={pair.a} picked={b.myPick === pair.a.id} dimmed={b.myPick !== null && b.myPick !== pair.a.id} onPress={() => onVote(pair.a.id)} />
        <Option cand={pair.b} picked={b.myPick === pair.b.id} dimmed={b.myPick !== null && b.myPick !== pair.b.id} onPress={() => onVote(pair.b.id)} />
      </View>
      <Text tone="ink2" role="status" testID="pick-hint">{b.myPick ? t("serata.pickedWait") : t("serata.pick")}</Text>
      {view.isHost ? <Button label={t("serataApp.room.force")} variant="quiet" onPress={onForce} busy={busy} testID="force" accessibilityLabel={t("serataApp.room.forceLabel")} /> : null}
    </View>
  );
}

function Stepper({ title, n, canAdd, onAdd, onRemove }: { title: string; n: number; canAdd: boolean; onAdd: () => void; onRemove: () => void }) {
  const { c } = useTheme();
  const btn = (label: string, glyph: string, on: boolean, press: () => void, id: string) => (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={!on || undefined}
      disabled={!on}
      onPress={press}
      testID={id}
      style={[{ width: control, height: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: on ? c.ink : c.rule, opacity: on ? 1 : 0.4 }, web({ cursor: on ? "pointer" : "default" })]}
    >
      <Text style={{ fontSize: 24, lineHeight: 28 }} aria-hidden>{glyph}</Text>
    </Pressable>
  );
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {btn(t("serata.table.remove", { title }), "−", n > 0, onRemove, "minus")}
      <Text role="status" variant="strong" style={{ minWidth: 28, textAlign: "center", fontSize: 22 }} aria-live="polite" aria-label={t("serataApp.table.count", { count: n, title })}>
        {n}
      </Text>
      {btn(t("serata.table.add", { title }), "+", canAdd, onAdd, "plus")}
    </View>
  );
}

export function Table({ view, offset, onSubmit, onForce, onOverdue, busy }: { view: RoomView; offset: number; onSubmit: (b: ReturnType<typeof cleanBallot>) => void; onForce: () => void; onOverdue: () => void; busy: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const table = view.table;
  const mine = table?.myBallot ?? null;
  const [placed, setPlaced] = useState<Record<string, number>>(mine?.dots ?? {});
  const [veto, setVeto] = useState<string | null>(mine?.veto ?? null);
  const [editing, setEditing] = useState(mine === null);
  const [problem, setProblem] = useState<string | null>(null);
  // A ballot that arrives from the server (another device of mine, a reconnect) fills the form once.
  useEffect(() => {
    if (mine) {
      setPlaced(mine.dots);
      setVeto(mine.veto);
      setEditing(false);
    }
  }, [mine?.veto, JSON.stringify(mine?.dots ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = useMemo(() => view.candidates.map((x) => x.id), [view.candidates]);
  if (!table) return null;
  const left = dotsLeft(placed, table.dots);
  const voted = view.participants.filter((p) => p.voted).length;
  const set = (id: string, delta: number) => {
    setProblem(null);
    setPlaced((p) => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) + delta) }));
  };
  const submit = () => {
    const ballot = cleanBallot(placed, veto);
    const p = ballotProblem(ballot, ids, table.dots);
    if (p) {
      setProblem(t("serataApp.table.problem", { dots: table.dots }));
      return;
    }
    setEditing(false);
    onSubmit(ballot);
  };
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        {table.deadline !== null ? <Countdown key={table.deadline} deadline={table.deadline} offset={offset} onOverdue={onOverdue} /> : null}
        <Text role="status" variant="small" tone="muted" testID="voted-count">{t("serataApp.room.votedCount", { voted, total: view.participants.length })}</Text>
        <Text tone="ink2">{t("serata.table.hint", { dots: table.dots })}</Text>
      </View>
      {editing ? (
        <>
          <Text variant="strong" role="status" aria-live="polite" testID="dots-left" tone={left === 0 ? "success" : "ink"}>
            {t("serata.table.left", { count: left })}
          </Text>
          <View>
            {view.candidates.map((cand) => {
              const n = placed[cand.id] ?? 0;
              return (
                <View key={cand.id} testID={`cand-${cand.id}`} style={{ gap: space.xs, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <MediaPoster title={cand.title} path={cand.posterPath} width={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="strong" numberOfLines={2}>{cand.title}</Text>
                      <Text variant="small" tone="muted">{yearOf(cand)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
                    <Stepper title={cand.title} n={n} canAdd={left > 0} onAdd={() => set(cand.id, 1)} onRemove={() => set(cand.id, -1)} />
                    <Chip
                      label={t("serata.table.veto")}
                      accessibilityLabel={veto === cand.id ? t("serataApp.table.vetoOff", { title: cand.title }) : t("serataApp.table.vetoOn", { title: cand.title })}
                      on={veto === cand.id}
                      testID={`veto-${cand.id}`}
                      onPress={() => {
                        setProblem(null);
                        setVeto(veto === cand.id ? null : cand.id);
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          <Text variant="small" tone="muted">{t("serataApp.table.vetoHint")}</Text>
          {problem ? <Text role="alert" tone="error">{problem}</Text> : null}
          <Button label={t("serata.table.submit")} onPress={submit} busy={busy} disabled={left !== 0} fullWidth testID="submit-ballot" />
        </>
      ) : (
        <View style={{ gap: space.sm }}>
          <Text variant="strong" tone="success" role="status" testID="ballot-sent">✓ {t("serata.table.done")}</Text>
          <RowList>
            {view.candidates
              .filter((cand) => (placed[cand.id] ?? 0) > 0 || veto === cand.id)
              .map((cand) => (
                <Row key={cand.id}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>{cand.title}</Text>
                  {(placed[cand.id] ?? 0) > 0 ? <Text variant="strong">{t("serata.result.dots", { count: placed[cand.id] })}</Text> : null}
                  {veto === cand.id ? <Tag tone="accent" label={t("serata.result.vetoed")} /> : null}
                </Row>
              ))}
          </RowList>
          <Button label={t("serata.table.change")} variant="secondary" onPress={() => setEditing(true)} />
        </View>
      )}
      {view.isHost ? <Button label={t("serataApp.room.force")} variant="quiet" onPress={onForce} busy={busy} testID="force" accessibilityLabel={t("serataApp.room.forceLabel")} /> : null}
    </View>
  );
}
