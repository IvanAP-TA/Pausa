import type { Candidate, RoomView } from "@pausa/api-types";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { siteOrigin } from "@/features/circle-links";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Minus, Plus, STROKE } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Text } from "@/ui/Text";
import { Well } from "@/ui/Surfaces";
import { Countdown } from "./Countdown";
import { BracketBar, DotMarks, figure, Plate, titleType, useGrid } from "./room-ui";
import { ballotProblem, cleanBallot, dotsLeft, matchNumber, matchPair, roomLink } from "./room-logic";
import "./serata.messages";

export const yearOf = (c: Pick<Candidate, "year">) => (c.year === null ? "" : String(Number(c.year)));

/** Who is in the room, as v1 draws it: a grid of faces; a small amber square on the face of whoever has voted in this round (never what). */
export function People({ view, showVotes }: { view: RoomView; showVotes: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  return (
    <Plate style={{ gap: space.md }}>
      <Text role="heading" aria-level={2} style={titleType(20)}>
        {t("serata.inRoom", { count: view.participants.length })}
      </Text>
      <View role="list" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.xs, rowGap: space.md }}>
        {view.participants.map((p) => (
          <View key={p.id} role="listitem" testID={`person-${p.name}`} style={{ width: 104, alignItems: "center", gap: space["2xs"] }}>
            <View>
              <Avatar name={p.name} image={p.image} size={40} />
              {showVotes && p.voted ? <View aria-hidden style={{ position: "absolute", right: -4, top: -4, width: 10, height: 10, backgroundColor: c.accent }} /> : null}
            </View>
            <Text numberOfLines={1} style={{ maxWidth: "100%" }}>
              {p.name}
            </Text>
            {p.isGuest ? (
              <Text variant="small" tone="muted">
                {t("serata.guest")}
              </Text>
            ) : null}
            {showVotes ? (
              <Text variant="small" tone={p.voted ? "ink2" : "muted"}>
                {p.voted ? `✓ ${t("serata.voted")}` : t("serata.choosing")}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Plate>
  );
}

/** The candidates in seed order, before the start: "rosa", as a grid of small posters. */
function Roster({ view }: { view: RoomView }) {
  const { t } = useI18n();
  const grid = useGrid(4, space.xs);
  return (
    <View style={{ gap: space.sm }}>
      <Text role="heading" aria-level={2} style={titleType(20)}>
        {t("serata.lobby.rosa", { count: view.candidates.length })}
      </Text>
      <View onLayout={grid.onLayout} style={grid.style} role="list">
        {grid.cell > 0
          ? view.candidates.map((cand) => (
              <View key={cand.id} role="listitem" style={{ width: grid.cell, gap: 6 }}>
                <MediaPoster title={cand.title} path={cand.posterPath} width={grid.cell} />
                <Text variant="small" numberOfLines={2} style={{ lineHeight: 17 }}>
                  {cand.title}
                </Text>
              </View>
            ))
          : null}
      </View>
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
    // A phone's browser opens its share sheet; a desktop one copies the link.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Pausa", text: t("serata.lobby.shareText"), url: link });
        return;
      } catch {
        return;
      }
    }
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={{ gap: space.lg }}>
      <Well grained style={{ padding: space.lg, gap: space.md }}>
        <Text tone="ink2">{t("serata.lobby.invite")}</Text>
        <Text variant="label" tone="muted" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
          {t("serataApp.lobby.code")}
        </Text>
        <Text
          testID="room-code"
          selectable
          style={[figure(60), { letterSpacing: 2, color: c.ink }, web({ fontVariant: "tabular-nums" })]}
          accessibilityLabel={view.code.split("").join(" ")}
        >
          {view.code}
        </Text>
        {/* The host's one amber control is the start; for a guest the link to pass on is the main thing here. */}
        <Button label={copied ? t("serata.lobby.copied") : t("serata.lobby.share")} variant={view.isHost ? "secondary" : "primary"} onPress={share} />
        {copied ? <Notice>{t("serata.lobby.copied")}</Notice> : null}
      </Well>
      <Roster view={view} />
      <People view={view} showVotes={false} />
      {view.isHost ? (
        <View style={{ gap: space.xs }}>
          <Button label={t("serata.lobby.start")} onPress={onStart} busy={busy} fullWidth testID="start" />
          <Text variant="small" tone="muted">{t("serataApp.lobby.startHint")}</Text>
        </View>
      ) : (
        <Text tone="ink2" role="status" style={{ textAlign: "center" }}>
          {t("serata.lobby.wait", { name: host?.name ?? "" })}
        </Text>
      )}
    </View>
  );
}

/** One of the two titles of a match: a big print, the whole thing is the target; the chosen one wears a 2px amber edge (and says so). */
function Option({ cand, width, picked, onPress }: { cand: Candidate; width: number; picked: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      role="radio"
      aria-checked={picked}
      aria-label={`${cand.title}${yearOf(cand) ? `, ${yearOf(cand)}` : ""}${picked ? `, ✓ ${t("serataApp.bracket.yours")}` : ""}`}
      onPress={onPress}
      testID={`option-${cand.id}`}
      style={[{ width, minHeight: control, gap: space.sm }, web({ cursor: "pointer", transition: "transform 150ms ease-out" })]}
    >
      <View>
        <MediaPoster title={cand.title} path={cand.posterPath} width={width} size="w342" />
        {picked ? <View aria-hidden pointerEvents="none" style={{ position: "absolute", inset: 0, borderWidth: 2, borderColor: c.accent }} /> : null}
      </View>
      <View style={{ gap: space["3xs"] }}>
        <Text style={titleType(24)} numberOfLines={3}>
          {cand.title}
        </Text>
        <Text variant="small" tone="muted">
          {[cand.kind ? t(`kind.${cand.kind as "movie" | "tv" | "anime"}`) : "", yearOf(cand)].filter(Boolean).join(", ")}
        </Text>
      </View>
    </Pressable>
  );
}

/** The head of a voting screen: the plate with the big "n/total" and the round on the left, the ring on the right. */
function VotingHead({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <Plate style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      {right}
    </Plate>
  );
}

export function Bracket({ view, offset, onVote, onForce, onOverdue, busy }: { view: RoomView; offset: number; onVote: (mediaId: string) => void; onForce: () => void; onOverdue: () => void; busy: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const b = view.bracket;
  const pair = matchPair(view);
  const gap = space.sm;
  const grid = useGrid(2, gap);
  if (!b || !pair) return null;
  const m = matchNumber(b);
  const voted = view.participants.filter((p) => p.voted).length;
  const round = t(`serata.round.${b.roundName as "final" | "semi" | "quarter"}`);
  const posterH = Math.round(grid.cell * 1.5);
  return (
    <View style={{ gap: space.md }}>
      <VotingHead
        left={
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
            <Text aria-hidden style={figure(60)}>
              {m.n}
              <Text tone="muted" style={figure(60)}>
                /{m.total}
              </Text>
            </Text>
            <View testID="round-name" role="status" style={{ flexShrink: 1, paddingBottom: 4 }}>
              <Text variant="small">{round}</Text>
              <Text variant="small" tone="muted">
                {t("serata.match", { n: m.n, total: m.total })}
              </Text>
            </View>
          </View>
        }
        right={b.deadline !== null ? <Countdown key={b.deadline} deadline={b.deadline} offset={offset} onOverdue={onOverdue} /> : null}
      />
      <BracketBar done={b.done} total={b.total} />
      <Text role="status" variant="small" tone="muted" testID="voted-count">
        {t("serataApp.room.votedCount", { voted, total: view.participants.length })}
      </Text>
      <Text tone="ink2" role="status" testID="pick-hint">
        {b.myPick ? t("serata.pickedWait") : t("serata.pick")}
      </Text>
      {/* The matchup: two prints as wide as the phone allows, the "vs" on the seam at half the height of a poster. */}
      <View role="radiogroup" aria-label={t("serata.pick")} onLayout={grid.onLayout} style={{ flexDirection: "row", gap, alignItems: "flex-start" }}>
        {grid.cell > 0 ? (
          <>
            <Option cand={pair.a} width={grid.cell} picked={b.myPick === pair.a.id} onPress={() => onVote(pair.a.id)} />
            <Option cand={pair.b} width={grid.cell} picked={b.myPick === pair.b.id} onPress={() => onVote(pair.b.id)} />
            <View aria-hidden pointerEvents="none" style={{ position: "absolute", left: "50%", top: posterH / 2, transform: [{ translateX: -22 }, { translateY: -18 }], backgroundColor: c.paper, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: "center", zIndex: 2 }}>
              <Text style={titleType(24)}>{t("serata.vs")}</Text>
            </View>
          </>
        ) : null}
      </View>
      {view.isHost ? <Button label={t("serataApp.room.force")} variant="quiet" onPress={onForce} busy={busy} testID="force" accessibilityLabel={t("serataApp.room.forceLabel")} /> : null}
    </View>
  );
}

function Stepper({ title, canAdd, n, onAdd, onRemove }: { title: string; n: number; canAdd: boolean; onAdd: () => void; onRemove: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const btn = (label: string, Icon: typeof Plus, on: boolean, press: () => void, id: string) => (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={!on || undefined}
      disabled={!on}
      onPress={press}
      testID={id}
      style={[{ width: control, height: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: on ? c.rule : c.rule, opacity: on ? 1 : 0.4 }, web({ cursor: on ? "pointer" : "default" })]}
    >
      <Icon size={18} strokeWidth={STROKE} color={c.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space["2xs"] }}>
      {btn(t("serata.table.remove", { title }), Minus, n > 0, onRemove, "minus")}
      {btn(t("serata.table.add", { title }), Plus, canAdd, onAdd, "plus")}
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
      <Plate style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end" }}>
        {table.deadline !== null ? <Countdown key={table.deadline} deadline={table.deadline} offset={offset} onOverdue={onOverdue} /> : null}
      </Plate>
      <View style={{ gap: space.xs }}>
        <Text role="status" variant="small" tone="muted" testID="voted-count">{t("serataApp.room.votedCount", { voted, total: view.participants.length })}</Text>
        <Text tone="ink2">{t("serata.table.hint", { dots: table.dots })}</Text>
      </View>
      {editing ? (
        <>
          <Text role="status" aria-live="polite" testID="dots-left" style={[titleType(24), { color: left === 0 ? c.success : c.ink }]}>
            {t("serata.table.left", { count: left })}
          </Text>
          <View>
            {view.candidates.map((cand) => {
              const n = placed[cand.id] ?? 0;
              const vetoed = veto === cand.id;
              return (
                <View key={cand.id} testID={`cand-${cand.id}`} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, borderTopWidth: hair, borderColor: c.rule, opacity: vetoed ? 0.6 : 1 }}>
                  <MediaPoster title={cand.title} path={cand.posterPath} width={56} />
                  <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between", gap: space.xs }}>
                    <Text style={[titleType(20), vetoed ? { textDecorationLine: "line-through" } : null]} numberOfLines={2}>
                      {cand.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs, flexWrap: "wrap" }}>
                      {/* The votes placed on this title: amber squares, the empty ones in the rule colour. */}
                      <View role="status" aria-live="polite" aria-label={t("serataApp.table.count", { count: n, title: cand.title })}>
                        <DotMarks n={n} min={table.dots} />
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space["2xs"] }}>
                        <Stepper title={cand.title} n={n} canAdd={left > 0} onAdd={() => set(cand.id, 1)} onRemove={() => set(cand.id, -1)} />
                        <Chip
                          label={t("serata.table.veto")}
                          accessibilityLabel={vetoed ? t("serataApp.table.vetoOff", { title: cand.title }) : t("serataApp.table.vetoOn", { title: cand.title })}
                          on={vetoed}
                          testID={`veto-${cand.id}`}
                          onPress={() => {
                            setProblem(null);
                            setVeto(vetoed ? null : cand.id);
                          }}
                        />
                      </View>
                    </View>
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
          <Well grained style={{ padding: space.lg, gap: space.sm }}>
            <Text role="status" testID="ballot-sent" style={[titleType(24), { color: c.success }]}>
              ✓ {t("serata.table.done")}
            </Text>
            <Button label={t("serata.table.change")} variant="quiet" onPress={() => setEditing(true)} />
          </Well>
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
        </View>
      )}
      {view.isHost ? <Button label={t("serataApp.room.force")} variant="quiet" onPress={onForce} busy={busy} testID="force" accessibilityLabel={t("serataApp.room.forceLabel")} /> : null}
    </View>
  );
}

