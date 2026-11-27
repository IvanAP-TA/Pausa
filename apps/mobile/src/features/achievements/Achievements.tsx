import type { AchievementsDto } from "@pausa/api-types";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { achievementsApi } from "@/api/achievements";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { num, relativeTime } from "@/features/diary/dates";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Field } from "@/ui/Field";
import { Row, RowList } from "@/ui/Row";
import { Screen } from "@/ui/Screen";
import { ErrorState, Loading, Notice } from "@/ui/Status";
import { Chapter } from "@/ui/Surfaces";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { TextLink } from "@/ui/TextLink";
import { Toggle } from "@/ui/Toggle";
import { RequireSession, useMe } from "../session";
import "./achievements.messages";
import { MilestoneCard } from "./Milestone";

function BoardSettings({ data, onChange }: { data: AchievementsDto; onChange: (d: AchievementsDto | null) => void }) {
  const { t, href } = useI18n();
  const me = useMe();
  const b = data.board;
  const [name, setName] = useState(b.publicName ?? "");
  const [page, setPage] = useState(b.publicProfile);
  const [invalid, setInvalid] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const act = useAction();
  useEffect(() => {
    setName(b.publicName ?? "");
    setPage(b.publicProfile);
  }, [b.publicName, b.publicProfile]);

  if (me.isAnonymous) return <Text tone="ink2">{t("achievements.board.guest")}</Text>;

  const save = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 32 || clean.includes("@") || /http|www\./i.test(clean)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const res = await act.run(() => achievementsApi.join({ publicName: clean, publicProfile: page }));
    if (res) {
      setNote(t("achievements.board.joined", { name: res.value.board.publicName ?? clean }));
      onChange(res.value);
    }
  };
  const leave = async () => {
    if (await act.run(() => achievementsApi.leave())) {
      setNote(t("achievements.board.left"));
      onChange(null);
    }
  };
  const cap = num(data.dailyCap) ?? 5;
  const score = (s: bigint | null, r: bigint | null, label: string) =>
    s === null ? null : (
      <Text testID={`board-me-${label}`}>
        {label === "all" ? t("achievements.board.all") : t("achievements.board.month")}: {t("achievements.board.points", { count: num(s) ?? 0 })}
        {r !== null ? ` · ${t("achievements.board.rank", { rank: num(r) ?? 0 })}` : ""}
      </Text>
    );

  return (
    <View style={{ gap: space.md }}>
      {note ? <Notice>{note}</Notice> : null}
      {b.joined ? (
        <View style={{ gap: space.xs }}>
          {score(b.scoreAll, b.rankAll, "all")}
          {score(b.scoreMonth, b.rankMonth, "month")}
          {b.scoreAll === null ? <Text tone="muted">{t("achievements.board.notYet")}</Text> : null}
          {b.publicProfile && b.handle ? <TextLink href={href(`/u/${b.handle}`)}>{t("achievements.board.openPage")}</TextLink> : null}
        </View>
      ) : (
        <Text tone="ink2">{t("achievements.board.off")}</Text>
      )}
      <Text variant="small" tone="muted">{t("achievements.board.rules", { cap })}</Text>
      <Field
        label={t("achievements.board.name")}
        value={name}
        onChangeText={setName}
        hint={t("achievements.board.nameHint")}
        error={invalid ? t("achievements.board.nameInvalid") : undefined}
        maxLength={40}
        autoCorrect={false}
        testID="board-name"
      />
      <Toggle label={t("achievements.board.publicPage")} hint={t("achievements.board.publicPageHint")} value={page} onChange={setPage} testID="board-public" />
      <Button label={b.joined ? t("achievements.board.save") : t("achievements.board.join")} onPress={save} busy={act.busy} testID="board-join" />
      {b.joined ? <ConfirmButton label={t("achievements.board.leave")} confirmLabel={t("achievements.board.leaveConfirm")} onConfirm={leave} busy={act.busy} /> : null}
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}
    </View>
  );
}

function Board({ version }: { version: number }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const [period, setPeriod] = useState<"all" | "month">("all");
  const board = useResource((signal) => achievementsApi.board(period, signal), [period, version]);
  return (
    <View style={{ gap: space.sm }}>
      <Choice
        label={t("achievements.board.title")}
        hideLabel
        value={period}
        onChange={setPeriod}
        options={[
          { value: "all", label: t("achievements.board.all"), testID: "board-all" },
          { value: "month", label: t("achievements.board.month"), testID: "board-month" },
        ]}
      />
      {board.loading && !board.data ? <Loading rows={3} /> : null}
      {board.error ? <ErrorState error={board.error} onRetry={board.reload} /> : null}
      {board.data ? (
        <>
          {board.data.rows.length === 0 ? (
            <Text tone="muted">{t("achievements.board.empty")}</Text>
          ) : (
            <RowList>
              {board.data.rows.map((r) => {
                const inner = (
                  <>
                    <Text variant="strong" style={{ width: 40, fontVariant: ["tabular-nums"] }}>{num(r.rank)}</Text>
                    <Text style={{ flex: 1 }} numberOfLines={1}>{r.publicName}</Text>
                    {r.me ? <Tag tone="accent" label={t("achievements.board.you")} /> : null}
                    <Text variant="small" tone="muted">{t("achievements.board.points", { count: num(r.score) ?? 0 })}</Text>
                  </>
                );
                return r.handle ? (
                  <Row key={`${r.rank}-${r.publicName}`} href={href(`/u/${r.handle}`)} testID="board-row">{inner}</Row>
                ) : (
                  <Row key={`${r.rank}-${r.publicName}`} testID="board-row">{inner}</Row>
                );
              })}
            </RowList>
          )}
          <Text variant="small" tone="muted" style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.xs }}>
            {t("achievements.board.members", { count: num(board.data.members) ?? 0 })}
            {board.data.computedAt !== null ? ` · ${t("achievements.board.computed", { when: relativeTime(board.data.computedAt, Date.now(), locale) })}` : ""}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function AchievementsBody() {
  const { t, href } = useI18n();
  const res = useResource((signal) => achievementsApi.mine(signal), []);
  const [data, setData] = useState<AchievementsDto | null>(null);
  const [version, setVersion] = useState(0);
  const shown = data ?? res.data;
  return (
    <Screen>
      <BackLink to={href("/me")} label={t("tabs.profile")} />
      <Heading level={1}>{t("achievements.title")}</Heading>
      <Text tone="ink2">{t("achievements.lede")}</Text>
      {res.loading && !shown ? <Loading rows={4} /> : null}
      {res.error && !shown ? <ErrorState error={res.error} onRetry={res.reload} /> : null}
      {shown ? (
        <>
          <View role="list" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {shown.milestones.map((m) => (
              <View role="listitem" key={m.kind} style={{ flexGrow: 1, flexBasis: 220 }}>
                <MilestoneCard m={m} />
              </View>
            ))}
          </View>
          <Chapter>{t("achievements.board.title")}</Chapter>
          <BoardSettings
            data={shown}
            onChange={(d) => {
              setData(d);
              if (!d) void res.reload();
              setVersion((v) => v + 1);
            }}
          />
          <Board version={version} />
        </>
      ) : null}
    </Screen>
  );
}

export function Achievements() {
  return (
    <RequireSession>
      <AchievementsBody />
    </RequireSession>
  );
}

