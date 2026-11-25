import { View } from "react-native";
import { hair, space, useTheme } from "@/theme";
import { Text, type Tone } from "./Text";

/** A 1px rule cell with a short word in it (a role, a count). */
export function Tag({ label, tone = "ink2", accessibilityLabel }: { label: string; tone?: Tone; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <View
      {...(accessibilityLabel ? { role: "img" as const, "aria-label": accessibilityLabel } : {})}
      style={{ borderWidth: hair, borderColor: tone === "accent" ? c.accent : c.rule, paddingHorizontal: space.xs, paddingVertical: 1, alignSelf: "flex-start" }}
    >
      <Text variant="small" tone={tone}>
        {label}
      </Text>
    </View>
  );
}
