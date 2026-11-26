import { Link, type Href } from "expo-router";
import type { ComponentType } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
  /** v1 `.btn-sm` (36px, text-md, 44px under a finger on native) and `.btn-lg` (52px, text-xl, public pages). */
  size?: "sm" | "md" | "lg";
  /** A lucide icon before the label (v1: Classifica with the trophy, Modifica with the pencil). */
  icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
};

const SIZES = {
  sm: { minHeight: Platform.OS === "web" ? 36 : control, paddingHorizontal: space.sm, fontSize: 16 },
  md: { minHeight: control, paddingHorizontal: space.lg, fontSize: 19.2 },
  lg: { minHeight: 52, paddingHorizontal: space.xl, fontSize: 23 },
} as const;

/**
 * v1 `.btn`: square, display capitals 400 at text-lg with 0.02em tracking, 44pt minimum. Primary is the accent rectangle
 * (accent-hover under the pointer; disabled, an empty rule outline with muted text); secondary a 1px ink outline that takes
 * paper-3 under the pointer; quiet a rule outline whose edge and text darken under the pointer. Press: scale 0.97.
 */
export function Button({ label, onPress, href, variant = "primary", disabled, busy, accessibilityLabel, fullWidth, style, testID, size = "md", icon: Icon }: ButtonProps) {
  const { c } = useTheme();
  const { pressed, hovered, bind } = usePressed();
  const off = disabled || busy;
  const hot = hovered && !off;
  const palette = {
    primary: off ? { bg: "transparent", fg: c.muted, border: c.rule } : { bg: hot ? c.accentHover : c.accent, fg: c.accentInk, border: hot ? c.accentHover : c.accent },
    secondary: { bg: hot ? c.paper3 : "transparent", fg: c.ink, border: c.ink },
    quiet: { bg: "transparent", fg: hot ? c.ink : c.ink2, border: hot ? c.muted : c.rule },
    danger: { bg: hot ? c.paper3 : "transparent", fg: c.error, border: c.error },
  }[variant];
  const sz = SIZES[size];
  const body = (
    <Pressable
      role={href ? "link" : "button"}
      aria-label={accessibilityLabel ?? label}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      disabled={off}
      onPress={onPress}
      testID={testID}
      {...bind}
      // One flat object (see usePressed): `Link asChild` cannot take a style function or array.
      style={StyleSheet.flatten([
        {
          minHeight: sz.minHeight,
          minWidth: control,
          paddingHorizontal: sz.paddingHorizontal,
          paddingVertical: space["2xs"],
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space.xs,
          backgroundColor: palette.bg,
          borderWidth: hair,
          borderColor: palette.border,
          opacity: off && variant !== "primary" ? 0.5 : 1,
          transform: [{ scale: pressed && !off ? 0.97 : 1 }],
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        web({ cursor: off ? "not-allowed" : "pointer", userSelect: "none", textDecorationLine: "none", whiteSpace: "nowrap", transition: "background-color 120ms cubic-bezier(0.16, 1, 0.3, 1), border-color 120ms cubic-bezier(0.16, 1, 0.3, 1), color 120ms cubic-bezier(0.16, 1, 0.3, 1), transform 120ms cubic-bezier(0.16, 1, 0.3, 1)" }),
        style,
      ])}
    >
      {Icon ? <Icon size={size === "sm" ? 18 : 22} strokeWidth={1.6} color={palette.fg} /> : null}
      <Title style={[{ color: palette.fg, fontSize: sz.fontSize, lineHeight: Math.round(sz.fontSize * 1.15), textAlign: "center" }, web({ letterSpacing: "0.02em" })]}>{label}</Title>
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : null}
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
