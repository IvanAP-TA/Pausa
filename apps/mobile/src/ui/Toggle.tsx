import { Pressable, View } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { Text } from "./Text";

/** A switch with its label and an optional hint; the whole row is the 44pt target. The state is spoken (`role="switch"`), never only coloured. */
export function Toggle({ label, hint, value, onChange, disabled, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={() => onChange(!value)}
      testID={testID}
      style={[{ minHeight: control, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, opacity: disabled ? 0.55 : 1 }, web({ cursor: "pointer" })]}
    >
      <View style={{ flex: 1, gap: space["3xs"] }}>
        <Text variant="strong">{label}</Text>
        {hint ? (
          <Text variant="small" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View aria-hidden style={{ width: 48, height: 28, borderWidth: hair, borderColor: value ? c.accent : c.muted, backgroundColor: value ? c.accent : "transparent", justifyContent: "center" }}>
        <View style={{ width: 20, height: 20, marginLeft: value ? 24 : 3, backgroundColor: value ? c.accentInk : c.muted }} />
      </View>
    </Pressable>
  );
}
