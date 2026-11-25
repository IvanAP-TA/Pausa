import { View } from "react-native";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Button } from "@/ui/Button";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Notice } from "@/ui/Status";
import { Text, Title } from "@/ui/Text";
import { ERROR_KEYS, isErrorCode } from "@/api/errors";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { useOutbox } from "./OutboxProvider";
import "./offline.messages";

/** The diary's "waiting to be sent" block: viewings written offline, with retry and discard. Nothing renders when the outbox is empty. */
export function PendingLogs() {
  const { t, date } = useI18n();
  const { c } = useTheme();
  const { entries, online, retry, discard } = useOutbox();
  if (entries.length === 0) return null;
  const pending = entries.filter((e) => e.status !== "failed").length;
  return (
    <View testID="pending-section">
      <Section title={t("offline.pending.title")} first>
        {/* One polite line that changes when the count or the connection does: the list below is not re-announced item by item. */}
        <Notice tone="ink2">
          {pending > 0 ? `${t("offline.pending.count", { count: pending })}. ` : ""}
          {online ? t("offline.pending.hint") : `${t("offline.pending.offlineNow")} ${t("offline.pending.hint")}`}
        </Notice>
        <View role="list" style={{ gap: space.sm }}>
          {entries.map((e) => (
            <View key={e.id} role="listitem" testID={`pending-${e.id}`} style={{ flexDirection: "row", gap: space.sm, borderWidth: hair, borderColor: c.rule, padding: space.sm }}>
              <MediaPoster title={e.title} path={e.posterPath} width={48} />
              <View style={{ flex: 1, gap: space.xs }}>
                <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
                  {e.title}
                </Title>
                <Text variant="small" tone="ink2">
                  {t("offline.pending.watchedOn", { date: date(new Date(`${e.input.watchedOn}T12:00:00`).getTime()) })}
                </Text>
                <Text variant="small" tone={e.status === "failed" ? "error" : "ink2"} testID={`pending-status-${e.id}`}>
                  {e.status === "failed" ? `${t("offline.pending.failed")}. ${t(ERROR_KEYS[isErrorCode(e.error) ? e.error : "internal"])}` : e.status === "sending" ? t("offline.pending.sending") : t("offline.pending.waiting")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  <Button label={t("offline.pending.retry")} accessibilityLabel={t("offline.pending.retryLabel", { title: e.title })} variant="secondary" disabled={e.status === "sending"} onPress={() => retry(e.id)} testID={`pending-retry-${e.id}`} />
                  <ConfirmButton label={t("offline.pending.discard")} accessibilityLabel={t("offline.pending.discardLabel", { title: e.title })} confirmLabel={t("offline.pending.discardConfirm")} onConfirm={() => discard(e.id)} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}
