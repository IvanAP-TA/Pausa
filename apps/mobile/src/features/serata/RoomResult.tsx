import type { RoomView } from "@pausa/api-types";
import { useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { openGoogle } from "@/features/google-sign-in";
import { useI18n } from "@/i18n";
import { fallbackSans, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { Well } from "@/ui/Surfaces";
import { exportCard } from "./card-image";
import { ShareCardSheet, cardData } from "./ShareCardSheet";
import { WatchedSheet } from "./WatchedSheet";
import { yearOf } from "./RoomPhases";
import { titleType } from "./room-ui";
import "./serata.messages";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The guest's way to keep the Serata: Google or a link by email, right here, and the way into the Cerchia. */
function KeepIt({ code, next, circleName, inviteCode }: { code: string; next: string; circleName: string | null; inviteCode: string | null }) {
  const { t, href, locale } = useI18n();
  const { data: google } = useResource(api.googleStatus, []);
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [sent, setSent] = useState(false);
  const send = useAction();
  const submit = async () => {
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const res = await send.run(() => api.requestMagicLink({ email: value, next, locale, native: Platform.OS !== "web" }));
    if (res) setSent(true);
  };
  return (
    <Well grained style={{ padding: space.lg, gap: space.md }} >
      <Heading level={3}>{t("serata.result.saveTitle")}</Heading>
      <Text tone="ink2">{t("serata.result.saveBody")}</Text>
      {google?.enabled ? <Button label={t("app.signIn.google")} variant="secondary" onPress={() => void openGoogle(next, locale)} fullWidth /> : null}
      {sent ? (
        <Text role="status">{t("serata.result.saveSent")}</Text>
      ) : (
        <View style={{ gap: space.xs }}>
          <Field label={t("auth.email")} required value={email} onChangeText={setEmail} placeholder={t("app.signIn.emailPlaceholder")} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} returnKeyType="send" onSubmitEditing={submit} error={invalid ? t("app.signIn.invalidEmail") : send.error ? errorMessage(t, send.error) : null} testID={`keep-email-${code}`} />
          <Button label={t("serata.result.saveCta")} onPress={submit} busy={send.busy} fullWidth testID="keep-send" />
        </View>
      )}
      {circleName && inviteCode ? <Button label={t("serata.result.joinCircle", { name: circleName })} variant="quiet" href={href(`/join/${inviteCode}`)} testID="join-circle" /> : null}
    </Well>
  );
}

/** The end of a Serata: the winner as a print, how it was decided (a draw is said), the table's scores, and what to do next. Never who voted what. */
export function RoomResult({ view, isGuest, signInNext }: { view: RoomView; isGuest: boolean; signInNext: string }) {
  const { t, href, locale, date } = useI18n();
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const [card, setCard] = useState(false);
  const [watched, setWatched] = useState(false);
  const [linked, setLinked] = useState(false);
  const [copied, setCopied] = useState(false);
  const share = useAction();
  // The Cerchia's name, the date and the way in come from the public result (the room's view does not carry them).
  const pub = useResource((signal) => serataApi.publicResult(view.code, signal), [view.code]);
  const result = view.result;
  const winner = view.candidates.find((x) => x.id === result?.winner);
  if (!result || !winner) return null;

  // The print as tall as the phone allows while its title stays in view (v1: 38dvh).
  const poster = Math.max(120, Math.min(Math.floor(height * 0.38 * (2 / 3)) , 260, width - 2 * space.md));
  const lines = [
    [pub.data?.circleName, pub.data ? date(pub.data.finishedAt) : null].filter(Boolean).join(", "),
    [t(`serata.mode.${view.mode}`), view.mode === "bracket" ? t("serata.result.rounds", { count: result.turns }) : null, t("serata.result.people", { count: result.people })].filter(Boolean).join(", "),
  ].filter(Boolean);

  // On a phone's browser the PNG goes straight to the system share sheet (v1); elsewhere the card opens, with its formats.
  const canShareFile = Platform.OS === "web" && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && typeof File !== "undefined" && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
  const onShare = async () => {
    if (!canShareFile || !pub.data) {
      setCard(true);
      return;
    }
    const data = cardData(pub.data, t, locale, date);
    const out = await share.run(() => exportCard({ variant: "story", data, fileName: `pausa-serata-${view.code}-story.png` }));
    if (out?.value === "downloaded") setCopied(true);
  };

  return (
    <View style={{ gap: space.lg }} testID="result">
      <View style={{ gap: space.md }}>
        <Text variant="small" tone="muted">{t("serata.result.kicker")}</Text>
        <View style={{ alignSelf: "center" }}>
          <MediaPoster title={winner.title} path={winner.posterPath} width={poster} size="w500" decorative={false} />
        </View>
        <View style={{ gap: space.xs }}>
          <Heading level={2} testID="winner-title" style={{ fontSize: 56, lineHeight: 58 }}>{winner.title}</Heading>
          <Text variant="lead" style={[{ lineHeight: 27 }, web({ fontFamily: `Barlow_300, ${fallbackSans}` })]}>{t("serata.result.subtitle")}</Text>
        </View>
        <View style={{ borderTopWidth: hair, borderColor: c.rule }}>
          {lines.map((l) => (
            <Text key={l} variant="small" tone="ink2" style={{ paddingVertical: 10, borderBottomWidth: hair, borderColor: c.rule, fontVariant: ["tabular-nums"] }}>
              {l}
            </Text>
          ))}
        </View>
        {yearOf(winner) ? <Text variant="small" tone="muted">{yearOf(winner)}</Text> : null}
        {result.drew ? (
          <View style={{ borderWidth: hair, borderColor: c.rule, padding: space.sm }} testID="drew">
            <Text role="status" variant="strong">{t("serataApp.result.drew")}</Text>
            <Text variant="small" tone="ink2">{t("serataApp.result.drewBody")}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: space.xs }}>
        <View style={{ flex: 1 }}>
          <Button label={copied ? t("serata.result.copied") : t("serata.result.share")} onPress={onShare} busy={share.busy} fullWidth testID="open-card" />
        </View>
        <View style={{ flex: 1 }}>
          {!isGuest && view.circleId ? (
            <Button label={linked ? t("serataApp.watched.done") : t("serataApp.watched.cta")} variant="secondary" onPress={() => setWatched(true)} disabled={linked} fullWidth testID="watched" />
          ) : (
            <Button label={t("serata.result.open")} variant="secondary" href={`${href(`/s/${view.code}/card`)}`} fullWidth />
          )}
        </View>
      </View>
      {linked ? <Notice>{t("serataApp.watched.linked")}</Notice> : null}

      {result.scores ? (
        <View style={{ gap: space.xs }}>
          <Text role="heading" aria-level={2} style={titleType(20)}>{t("serata.result.scores")}</Text>
          <RowList>
            {result.scores.map((s) => {
              const cand = view.candidates.find((x) => x.id === s.mediaId);
              return (
                <Row key={s.mediaId} testID={`score-${s.mediaId}`}>
                  <Text style={[{ flex: 1 }, s.vetoed ? { textDecorationLine: "line-through" } : null]} tone={s.vetoed ? "muted" : "ink"} numberOfLines={2} variant={s.mediaId === result.winner ? "strong" : "body"}>{cand?.title ?? ""}</Text>
                  {s.vetoed ? <Tag tone="accent" label={t("serata.result.vetoed")} /> : null}
                  <Text variant="small" tone="muted">{t("serata.result.dots", { count: s.dots })}</Text>
                </Row>
              );
            })}
          </RowList>
        </View>
      ) : null}
      {share.error ? <Text role="alert" tone="error">{t("serataApp.card.failed")}</Text> : null}

      {isGuest ? <KeepIt code={view.code} next={signInNext} circleName={pub.data?.circleName ?? null} inviteCode={pub.data?.inviteCode ?? null} /> : null}

      {!isGuest && view.circleId ? <Button label={t("serata.result.backToCircle")} variant="quiet" href={href(`/c/${view.circleId}/serate`)} /> : null}

      <ShareCardSheet code={view.code} open={card} onClose={() => setCard(false)} />
      {!isGuest ? <WatchedSheet code={view.code} winner={winner} open={watched} onClose={() => setWatched(false)} onLinked={() => setLinked(true)} /> : null}
    </View>
  );
}
