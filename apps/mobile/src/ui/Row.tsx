import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { usePressed } from "./usePressed";
import { control, hair, space, useTheme, web } from "@/theme";

/** A list is rows on the ground parted by full-width hairlines, never a stack of boxes (DESIGN.md). */
export function RowList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View role="list" style={[{ borderTopWidth: hair, borderColor: c.rule }, style]}>
      {children}
    </View>
  );
}

type RowProps = {
  children: ReactNode;
  onPress?: () => void;
  href?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** A row that is one option of a radio group: it IS the radio (`aria-checked`), and sits in a group, not in a list. */
  radio?: { checked: boolean };
};

export function Row({ children, onPress, href, accessibilityLabel, disabled, style, testID, radio }: RowProps) {
  const { c } = useTheme();
  const { pressed, handlers } = usePressed();
  const base: ViewStyle = {
    minHeight: control,
    paddingVertical: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderBottomWidth: hair,
    borderColor: c.rule,
  };
  if (!onPress && !href) {
    return (
      <View role="listitem" testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }
  const body = (
    <Pressable
      role={radio ? "radio" : href ? "link" : "button"}
      aria-checked={radio ? radio.checked : undefined}
      aria-label={accessibilityLabel}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...handlers}
      style={StyleSheet.flatten([base, { backgroundColor: pressed ? c.paper2 : "transparent" }, web({ cursor: "pointer" }), style])}
    >
      {children}
    </Pressable>
  );
  // A list may only hold list items (axe `aria-required-children`): the link / button sits INSIDE the item, as in `<li><a>`.
  if (radio) return body;
  return (
    <View role="listitem">
      {href ? (
        <Link href={href as Href} asChild>
          {body}
        </Link>
      ) : (
        body
      )}
    </View>
  );
}
