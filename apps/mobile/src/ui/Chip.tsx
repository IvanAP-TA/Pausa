import { Pressable, View } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { Text } from "./Text";

/** One toggle in a multiple choice ("watched with", "share with"): a checkbox, 44pt, the chosen one filled and ticked. */
export function Chip({ label, on, onPress, testID, accessibilityLabel }: { label: string; on: boolean; onPress: () => void; testID?: string; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="checkbox"
      aria-checked={on}
      aria-label={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      style={[
        {
          minHeight: control,
          minWidth: control,
          paddingHorizontal: space.md,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: hair,
          borderColor: on ? c.ink : c.rule,
          backgroundColor: on ? c.paper3 : "transparent",
        },
        web({ cursor: "pointer" }),
      ]}
    >
      <Text variant={on ? "strong" : "body"} tone={on ? "ink" : "ink2"} numberOfLines={1}>
        {on ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

/** A labelled group of chips that wrap. */
export function ChipGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View role="group" aria-label={label} style={{ gap: space["2xs"] }}>
      <Text variant="label" tone="ink2">
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{children}</View>
      {hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
