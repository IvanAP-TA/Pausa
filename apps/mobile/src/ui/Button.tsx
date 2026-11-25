import { Link, type Href } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { Title } from "./Text";
import { usePressed } from "./usePressed";

type Variant = "primary" | "secondary" | "quiet" | "danger";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  href?: string;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  /** Overrides the spoken label when the visible one is not enough ("Gestisci Anna"). */
  accessibilityLabel?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Square, display capitals, 44pt minimum (DESIGN.md controls). Press feedback is instant (scale 0.97): no animation to reduce. */
export function Button({ label, onPress, href, variant = "primary", disabled, busy, accessibilityLabel, fullWidth, style, testID }: ButtonProps) {
  const { c } = useTheme();
  const { pressed, handlers } = usePressed();
  const off = disabled || busy;
  const palette = {
    primary: { bg: c.accent, fg: c.accentInk, border: c.accent },
    secondary: { bg: "transparent", fg: c.ink, border: c.ink },
    quiet: { bg: "transparent", fg: c.ink2, border: c.rule },
    danger: { bg: "transparent", fg: c.error, border: c.error },
  }[variant];
  const body = (
    <Pressable
      role={href ? "link" : "button"}
      aria-label={accessibilityLabel ?? label}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      disabled={off}
      onPress={onPress}
      testID={testID}
      {...handlers}
      // One flat object (see usePressed): `Link asChild` cannot take a style function or array.
      style={StyleSheet.flatten([
        {
          minHeight: control,
          minWidth: control,
          paddingHorizontal: space.lg,
          paddingVertical: space.xs,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space.xs,
          backgroundColor: palette.bg,
          borderWidth: hair,
          borderColor: palette.border,
          opacity: off ? 0.55 : 1,
          transform: [{ scale: pressed && !off ? 0.97 : 1 }],
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        web({ cursor: off ? "default" : "pointer", userSelect: "none", textDecorationLine: "none" }),
        style,
      ])}
    >
      <Title style={{ color: palette.fg, fontSize: 20, lineHeight: 24, textAlign: "center" }}>{label}</Title>
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : <View />}
    </Pressable>
  );
  return href && !off ? (
    <Link href={href as Href} asChild>
      {body}
    </Link>
  ) : (
    body
  );
}
