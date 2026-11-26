import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { serataApi } from "@/api/serata";
import { ApiFailure } from "@/api/errors";
import { useResource } from "@/api/useResource";
import { siteOrigin } from "@/features/circle-links";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Text } from "@/ui/Text";
import { CARD, QUIET } from "./CardView";
import { qrRuns } from "./card-spec";
import { qrMatrix } from "./qr";
import { Plate } from "./room-ui";
import { codeFrom } from "./room-logic";
import { SerataCard } from "./SerataCard";
import { ShareCardSheet } from "./ShareCardSheet";
import "./serata.messages";

/** A QR code as light square with its quiet zone and dark runs, `size` px wide. */
function Qr({ text, size, label }: { text: string; size: number; label: string }) {
  const m = useMemo(() => qrMatrix(text), [text]);
  const unit = size / (m.length + QUIET * 2);
  return (
    <View role="img" aria-label={label} style={{ width: size, height: size, backgroundColor: CARD.qrLight, borderWidth: hair, borderColor: CARD.rule }}>
      {qrRuns(m).map(([r, c, len]) => (
        <View key={`${r}-${c}`} style={{ position: "absolute", left: (c + QUIET) * unit, top: (r + QUIET) * unit, width: len * unit + 0.5, height: unit + 0.5, backgroundColor: CARD.qrDark }} />
      ))}
    </View>
  );
}

/**
 * What anybody sees of a finished Serata, with no account: the card as v1 draws it (poster edge to edge, hairline title, the facts),
 * the way in to Pausa, the QR that opens the site, and the catalogue credit. Used by `/s/:code/card` and by `/s/:code` for a person
 * who was not in the room.
 */
export function PublicResult({ code }: { code: string }) {
  const { t, href, locale, date } = useI18n();
  const { c } = useTheme();
  const res = useResource((signal) => serataApi.publicResult(code, signal), [code]);
  const [sheet, setSheet] = useState(false);
  if (res.loading && !res.data)
    return (
      <Screen width={448}>
        <Loading rows={3} />
      </Screen>
    );
  if (res.error || !res.data)
    return (
      <Screen width={448}>
        {res.error instanceof ApiFailure && res.error.code === "not_found" ? <Empty title={t("serataApp.room.notFound")} body={t("serataApp.room.notFoundBody")} /> : <ErrorState error={res.error} onRetry={res.reload} />}
        <Button label={t("errors.home")} variant="secondary" href={href("/home")} />
      </Screen>
    );
  const r = res.data;
  const lines = [
    [r.circleName, date(r.finishedAt)].filter(Boolean).join(", "),
    [t(`serata.mode.${r.mode as "bracket" | "table"}`), r.mode === "bracket" ? t("serata.result.rounds", { count: r.turns }) : null, t("serata.result.people", { count: r.people })].filter(Boolean).join(", "),
  ];
  return (
    <Screen width={448}>
      <SerataCard kicker={t("serata.result.kicker")} subtitle={t("serata.result.subtitle")} title={r.winner.title} posterPath={r.winner.posterPath} lines={lines} testID="serata-card" />
      <Text tone="ink2">{t("serata.result.cta")}</Text>
      <View style={{ gap: space.xs }}>
        <Button label={t("serata.result.ctaButton")} href={href("/sign-in")} fullWidth size="lg" />
        <Button label={t("serata.result.share")} variant="secondary" onPress={() => setSheet(true)} fullWidth />
      </View>
      <Plate style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.lg }}>
        <Qr text={`${siteOrigin()}/${locale}?utm_source=card`} size={112} label={t("serata.result.qrAlt")} />
        <Text variant="small" tone="muted" style={{ flex: 1, color: c.muted }}>
          {t("serata.result.qr")}
        </Text>
      </Plate>
      <Text variant="small" tone="muted">{t("tmdb.attribution")}</Text>
      <ShareCardSheet code={code} open={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}

/** `/{locale}/s/{code}/card`: the public page of a Serata's card. */
export function SerataCardPage() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  return <PublicResult code={codeFrom(String(raw ?? ""))} />;
}
