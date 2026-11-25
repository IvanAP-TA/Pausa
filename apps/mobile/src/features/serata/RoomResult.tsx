import type { LogDto, RoomView } from "@pausa/api-types";
import { useState } from "react";
import { View } from "react-native";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { errorMessage } from "@/api/errors";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { Sheet } from "@/ui/Sheet";
import { Empty, ErrorState, Loading, Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { useResource } from "@/api/useResource";
import { ShareCardSheet } from "./ShareCardSheet";
import { WatchedSheet } from "./WatchedSheet";
import { yearOf } from "./RoomPhases";
import "./serata.messages";

/** The end of a Serata: the winner, how it was decided (a draw is said), the table's scores, and what to do next. Never who voted what. */
export function RoomResult({ view, isGuest, signInNext }: { view: RoomView; isGuest: boolean; signInNext: string }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const [card, setCard] = useState(false);
  const [watched, setWatched] = useState(false);
  const [linked, setLinked] = useState(false);
  const result = view.result;
  const winner = view.candidates.find((x) => x.id === result?.winner);
  if (!result || !winner) return null;
  return (
    <View style={{ gap: space.lg }} testID="result">
      <View style={{ gap: space.sm, alignItems: "flex-start" }}>
        <Text variant="label" tone="accent" style={{ letterSpacing: 2 }}>{t("serata.result.kicker")}</Text>
        <MediaPoster title={winner.title} path={winner.posterPath} width={168} size="w342" decorative={false} />
        <Heading level={2} testID="winner-title">{winner.title}</Heading>
        <Text tone="ink2">
          {[t(`serata.mode.${view.mode}`), t("serata.result.rounds", { count: result.turns }), t("serata.result.people", { count: result.people })].join(" · ")}
        </Text>
        {yearOf(winner) ? <Text variant="small" tone="muted">{yearOf(winner)}</Text> : null}
        {result.drew ? (
          <View style={{ borderWidth: hair, borderColor: c.rule, padding: space.sm }} testID="drew">
            <Text role="status" variant="strong">{t("serataApp.result.drew")}</Text>
            <Text variant="small" tone="ink2">{t("serataApp.result.drewBody")}</Text>
          </View>
        ) : null}
      </View>

      {result.scores ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" tone="ink2" role="heading" aria-level={2}>{t("serata.result.scores")}</Text>
          <RowList>
            {result.scores.map((s) => {
              const cand = view.candidates.find((x) => x.id === s.mediaId);
              return (
                <Row key={s.mediaId} testID={`score-${s.mediaId}`}>
                  <Text style={{ flex: 1 }} numberOfLines={2} variant={s.mediaId === result.winner ? "strong" : "body"}>{cand?.title ?? ""}</Text>
                  {s.vetoed ? <Tag tone="accent" label={t("serata.result.vetoed")} /> : null}
                  <Text variant="strong">{t("serata.result.dots", { count: s.dots })}</Text>
                </Row>
              );
            })}
          </RowList>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("serata.result.share")} onPress={() => setCard(true)} testID="open-card" />
        {!isGuest && view.circleId ? (
          <Button label={linked ? t("serataApp.watched.done") : t("serataApp.watched.cta")} variant="secondary" onPress={() => setWatched(true)} disabled={linked} testID="watched" />
        ) : null}
        {view.circleId && !isGuest ? <Button label={t("serata.result.backToCircle")} variant="quiet" href={href(`/c/${view.circleId}/serate`)} /> : null}
      </View>
      {linked ? <Notice>{t("serataApp.watched.linked")}</Notice> : null}

      {isGuest ? (
        <View style={{ gap: space.xs, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.md }}>
          <Heading level={3} style={{ fontSize: 26, lineHeight: 30 }}>{t("serata.result.saveTitle")}</Heading>
          <Text tone="ink2">{t("serata.result.saveBody")}</Text>
          <Button label={t("serata.result.saveCta")} variant="secondary" href={`${href("/sign-in")}?next=${encodeURIComponent(signInNext)}`} />
        </View>
      ) : null}

      <ShareCardSheet code={view.code} open={card} onClose={() => setCard(false)} />
      {!isGuest ? <WatchedSheet code={view.code} winner={winner} open={watched} onClose={() => setWatched(false)} onLinked={() => setLinked(true)} /> : null}
    </View>
  );
}
