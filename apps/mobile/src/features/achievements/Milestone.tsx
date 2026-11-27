import type { Milestone } from "@pausa/api-types";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { num } from "@/features/diary/dates";
import { space } from "@/theme";
import { Meter, Well } from "@/ui/Surfaces";
import { Text, Title } from "@/ui/Text";
import "./milestone.messages";

/** One ladder: its name, where the person stands, a meter towards the next step. */
export function MilestoneCard({ m }: { m: Milestone }) {
  const { t } = useI18n();
  const value = num(m.value) ?? 0;
  const reached = num(m.reached) ?? 0;
  const next = m.next === null ? null : (num(m.next) ?? 0);
  const share = next === null ? 1 : (value - reached) / Math.max(1, next - reached);
  return (
    <View testID={`milestone-${m.kind}`} style={{ flexGrow: 1 }}>
    <Well grained style={{ padding: space.md, gap: space.xs, flexGrow: 1 }}>
      <Text variant="label" tone="ink2">{t(`milestone.kinds.${m.kind}`)}</Text>
      <Title style={{ fontSize: 40, lineHeight: 42 }}>{value}</Title>
      <Meter value={share} />
      <Text variant="small" tone="muted">
        {next === null ? t("milestone.top", { value }) : t("milestone.progress", { value, next })}
      </Text>
      <Text variant="small" tone="muted">{m.level > 0 ? t("milestone.level", { level: m.level, levels: m.levels }) : t("milestone.none")}</Text>
    </Well>
    </View>
  );
}

