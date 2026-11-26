import type { AdminReport } from "@pausa/api-types";
import { View } from "react-native";
import { adminApi, type Resolution } from "@/api/admin";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme } from "@/theme";
import { Button, Heading, Loading, Screen, Tag, Text } from "@/ui";
import { Well } from "@/ui/Surfaces";
import { RequireSession } from "../session";
import { AdminError } from "./NotHere";
import "./admin.messages";

const REASONS = ["spam", "abuse", "privacy", "other"] as const;
const KINDS = ["comment", "log", "user"] as const;
const pick = <T extends string>(list: readonly T[], v: string): T => (list as readonly string[]).includes(v) ? (v as T) : (list[list.length - 1] as T);

function OpenReport({ r, onDone }: { r: AdminReport; onDone: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const act = useAction();
  const resolve = async (resolution: Resolution) => {
    if (await act.run(() => adminApi.resolveReport(r.id, resolution))) onDone();
  };
  return (
    <View role="listitem" testID={`report-${r.id}`} style={{ gap: space.sm, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Tag label={t(`admin.reports.${pick(KINDS, r.kind)}`)} />
        <Tag label={t(`admin.reports.${pick(REASONS, r.reason)}`)} />
        <Text variant="small" tone="muted">
          {(r.reporterName ? t("admin.reports.by", { name: r.reporterName }) : t("admin.reports.byDeleted")) + (r.circleName ? `, ${r.circleName}` : "")}
        </Text>
      </View>
      <Text style={{ overflow: "hidden" }}>{r.excerpt ?? t("admin.reports.gone")}</Text>
      {r.note ? <Text variant="small" tone="muted">{t("admin.reports.note", { note: r.note })}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={t("admin.reports.remove")} variant="quiet" size="sm" style={{ minHeight: control }} busy={act.busy} onPress={() => resolve("removed")} testID={`report-remove-${r.id}`} />
        <Button label={t("admin.reports.dismiss")} variant="quiet" size="sm" style={{ minHeight: control }} busy={act.busy} onPress={() => resolve("dismissed")} testID={`report-dismiss-${r.id}`} />
      </View>
      {act.error ? <Text tone="error" role="alert">{errorMessage(t, act.error)}</Text> : null}
    </View>
  );
}

function Body() {
  const { t } = useI18n();
  const { c } = useTheme();
  const open = useResource((s) => adminApi.reports("open", s), []);
  const done = useResource((s) => adminApi.reports("resolved", s), []);
  const refresh = () => {
    void open.reload();
    void done.reload();
  };
  if (open.loading || done.loading) return <Loading rows={3} />;
  const error = open.error ?? done.error;
  if (error) return <AdminError error={error} onRetry={refresh} />;
  const list = open.data?.reports ?? [];
  const closed = (done.data?.reports ?? []).slice(0, 10);
  return (
    <>
      <Heading level={1}>{t("admin.reports.title")}</Heading>
      {list.length === 0 ? (
        <Well grained style={{ padding: space.lg }}>
          <Text tone="ink2">{t("admin.reports.none")}</Text>
        </Well>
      ) : (
        <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
          {list.map((r) => (
            <OpenReport key={r.id} r={r} onDone={refresh} />
          ))}
        </View>
      )}
      {closed.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Heading level={2}>{t("admin.reports.recent")}</Heading>
          <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
            {closed.map((r) => (
              <View key={r.id} role="listitem" style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }}>
                <Text variant="small" tone="ink2" style={{ width: 88 }}>
                  {t(`admin.reports.${r.resolution === "removed" ? "removed" : r.resolution === "user_disabled" ? "user_disabled" : "dismissed"}`)}
                </Text>
                <Text variant="small" tone="muted" style={{ flex: 1 }}>{r.excerpt ?? t("admin.reports.gone")}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

/** The operator's queue of open reports, and the ones closed recently. Everyone else sees a missing page. */
export function Reports() {
  return (
    <RequireSession>
      <Screen width={672}>
        <Body />
      </Screen>
    </RequireSession>
  );
}
