import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Field } from "@/ui/Field";
import { Sheet } from "@/ui/Sheet";
import { presetOf, yearPresets } from "./ranking-controls";
import { presetLabel } from "./year-range-label";
import "./stats.messages";

export type YearRange = { yearFrom?: number; yearTo?: number };
const year = (v: string) => (/^\d{4}$/.test(v.trim()) ? Number(v) : undefined);

/** Release-year range: "all", the last N years, one decade per decade with titles, or a custom from/to. */
export function YearRangeSheet({ open, onClose, value, onApply, yearMin, yearMax }: { open: boolean; onClose: () => void; value: YearRange; onApply: (r: YearRange) => void; yearMin: number | null; yearMax: number | null }) {
  const { t } = useI18n();
  const presets = yearPresets(new Date().getFullYear(), yearMin, yearMax);
  const [sel, setSel] = useState<string>(() => presetOf(value, presets));
  const [from, setFrom] = useState(value.yearFrom ? String(value.yearFrom) : "");
  const [to, setTo] = useState(value.yearTo ? String(value.yearTo) : "");
  const apply = () => {
    const p = presets.find((x) => x.id === sel);
    onApply(p ? { yearFrom: p.yearFrom, yearTo: p.yearTo } : { yearFrom: year(from), yearTo: year(to) });
    onClose();
  };
  return (
    <Sheet title={t("stats.ranking.years")} open={open} onClose={onClose}>
      <View role="radiogroup" aria-label={t("stats.ranking.years")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {presets.map((p) => (
          <Chip key={p.id} type="radio" label={presetLabel(t, p)} on={sel === p.id} onPress={() => setSel(p.id)} testID={`year-${p.id}`} />
        ))}
        <Chip type="radio" label={t("stats.ranking.custom")} on={sel === "custom"} onPress={() => setSel("custom")} testID="year-custom" />
      </View>
      {sel === "custom" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label={t("stats.ranking.from")} value={from} onChangeText={setFrom} keyboardType="number-pad" maxLength={4} hint={yearMin ? String(yearMin) : undefined} testID="year-custom-from" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("stats.ranking.to")} value={to} onChangeText={setTo} keyboardType="number-pad" maxLength={4} hint={yearMax ? String(yearMax) : undefined} testID="year-custom-to" />
          </View>
        </View>
      ) : null}
      <Button label={t("stats.ranking.apply")} onPress={apply} testID="apply-years" />
    </Sheet>
  );
}
