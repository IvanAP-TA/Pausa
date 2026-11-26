import type { AdminMetrics } from "@pausa/api-types";
import { useMemo } from "react";
import { View } from "react-native";
import { adminApi } from "@/api/admin";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { fallbackSans, fonts, space, useTheme, web } from "@/theme";
import { Heading, Loading, Row, RowList, Screen, Text } from "@/ui";
import { RequireSession } from "../session";
import { AdminError } from "./NotHere";
import "./admin.messages";

/** A big figure in the display face, with lining numerals so a column of them lines up. */
function Figure({ children, size }: { children: string; size: number }) {
  const { c } = useTheme();
  return (
    <Text
      style={[
        { fontFamily: fonts.display200, fontSize: size, lineHeight: Math.round(size * 1.05), color: c.ink },
        web({ fontFamily: `${fonts.display200}, ${fallbackSans}`, fontVariantNumeric: "lining-nums tabular-nums", fontSynthesis: "none" }),
      ]}
    >
      {children}
    </Text>
  );
}

function Body({ m }: { m: AdminMetrics }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const when = useMemo(() => new Date().toLocaleString(locale), [m, locale]);
  const pct = (v: number | null) => (v === null ? t("admin.na") : `${Math.round(v * 100)}%`);
  const one = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = (v: number | null) => (v === null ? t("admin.na") : one.format(v));
  const finished = String(m.serataFinished);

  const rows: { label: string; value: string; note: string }[] = [
    { label: t("admin.metrics.circleWithin7d"), value: pct(m.circleWithin7d), note: t("admin.metrics.circleWithin7dNote", { count: m.circleWithin7dCohort }) },
    { label: t("admin.metrics.logsPerCircle"), value: num(m.logsPerActiveCircleWeek), note: t("admin.metrics.logsPerCircleNote") },
    { label: t("admin.metrics.circlesLists"), value: pct(m.circlesUsingLists), note: t("admin.metrics.circlesListsNote", { count: m.circles }) },
    {
      label: t("admin.metrics.serataTime"),
      value: m.serataMedianSeconds === null ? t("admin.na") : t("admin.metrics.serataTimeValue", { seconds: Math.round(m.serataMedianSeconds) }),
      note: t("admin.metrics.serataTimeNote", { rate: pct(m.serataUnder120), finished }),
    },
    { label: t("admin.metrics.serataShared"), value: pct(m.serataCardRate), note: t("admin.metrics.serataSharedNote", { rate: pct(m.serataInviteRate), finished }) },
    { label: t("admin.metrics.retention7"), value: pct(m.retentionD7), note: t("admin.metrics.retentionNote", { count: m.retentionD7Eligible }) },
    { label: t("admin.metrics.retention30"), value: pct(m.retentionD30), note: t("admin.metrics.retentionNote", { count: m.retentionD30Eligible }) },
    { label: t("admin.metrics.nowWatching"), value: pct(m.nowWatchingRate), note: t("admin.metrics.nowWatchingNote", { count: m.nowWatchingPeople }) },
  ];
  const totals: [number, string][] = [
    [m.users, t("admin.metrics.users")],
    [m.circles, t("admin.metrics.circles")],
    [m.logs, t("admin.metrics.logs")],
    [m.serate, t("admin.metrics.serate")],
  ];

  return (
    <>
      <View style={{ gap: space.md }}>
        <Heading level={1}>{t("admin.metrics.title")}</Heading>
        {/* The totals: four figures, each over its label, on an ink rule. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.md }}>
          {totals.map(([value, label]) => (
            <View key={label} style={{ minWidth: 120, flexGrow: 1, flexBasis: 120, gap: space["2xs"], borderTopWidth: 1, borderColor: c.ink, paddingTop: space.sm }}>
              <Figure size={48}>{String(value)}</Figure>
              <Text variant="small" tone="muted">{label}</Text>
            </View>
          ))}
        </View>
        <Text variant="small" tone="muted">{t("admin.metrics.computedAt", { date: when })}</Text>
      </View>
      <RowList>
        {rows.map((r) => (
          <Row key={r.label} style={{ alignItems: "flex-start", paddingVertical: space.md, gap: space.md }}>
            <View style={{ flex: 1, gap: space["2xs"] }}>
              <Text>{r.label}</Text>
              <Text variant="small" tone="muted">{r.note}</Text>
            </View>
            <Figure size={40}>{r.value}</Figure>
          </Row>
        ))}
      </RowList>
      <Text variant="small" tone="muted">{t("admin.notAvailableNote")}</Text>
    </>
  );
}

/** The operator's early success numbers (master prompt section 10). Everyone else sees a missing page. */
export function Metrics() {
  const { data, error, loading, reload } = useResource((s) => adminApi.metrics(s), []);
  return (
    <RequireSession>
      <Screen width={672}>
        {loading ? <Loading rows={4} /> : error ? <AdminError error={error} onRetry={reload} /> : data ? <Body m={data} /> : null}
      </Screen>
    </RequireSession>
  );
}
