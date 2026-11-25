import { View } from "react-native";
import { hair, useTheme } from "@/theme";

/**
 * A determinate bar: `role="progressbar"` with its value and a spoken label. It is a bar of colour, drawn at the new width at once
 * (no animation to reduce); the moving part is the number, which the screen announces itself.
 */
export function ProgressBar({ value, max, label, tone = "accent", height = 8, decorative }: { value: number; max: number; label: string; tone?: "accent" | "ink"; height?: number; /** Inside something that already speaks (a timer): hidden from screen readers. */ decorative?: boolean }) {
  const { c } = useTheme();
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View
      {...(decorative ? { "aria-hidden": true as const } : { role: "progressbar" as const, "aria-label": label, "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": Math.min(max, Math.max(0, value)) })}
      style={{ height, borderWidth: hair, borderColor: c.rule, backgroundColor: c.paper2, overflow: "hidden" }}
    >
      <View style={{ height: "100%", width: `${share * 100}%`, backgroundColor: tone === "accent" ? c.accent : c.ink }} />
    </View>
  );
}
