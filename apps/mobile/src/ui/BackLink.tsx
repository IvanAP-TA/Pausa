import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { control, space, useTheme, web } from "@/theme";
import { ChevronLeft } from "./lucide";
import { Text } from "./Text";
import { usePressed } from "./usePressed";

/** v1 back-link.tsx: a chevron and a word at the top left of the content, text-sm in ink-2, ink under the pointer. No underline. */
export function BackLink({ to, label }: { to: string; label: string }) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  const color = hovered ? c.ink : c.ink2;
  return (
    <Link href={to as Href} asChild>
      <Pressable
        role="link"
        aria-label={label}
        {...bind}
        style={StyleSheet.flatten([{ alignSelf: "flex-start", minHeight: control, flexDirection: "row", alignItems: "center", gap: space["2xs"], marginLeft: -space.xs, paddingRight: space.xs }, web({ cursor: "pointer", transition: "color 120ms" })])}
      >
        <ChevronLeft size={20} strokeWidth={1.6} color={color} />
        <Text variant="small" style={{ color }}>{label}</Text>
      </Pressable>
    </Link>
  );
}

/** The same look as BackLink, for a step back inside the screen (no navigation): a button. */
export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  const color = hovered ? c.ink : c.ink2;
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      {...bind}
      style={StyleSheet.flatten([{ alignSelf: "flex-start", minHeight: control, flexDirection: "row", alignItems: "center", gap: space["2xs"], marginLeft: -space.xs, paddingRight: space.xs }, web({ cursor: "pointer", transition: "color 120ms" })])}
    >
      <ChevronLeft size={20} strokeWidth={1.6} color={color} />
      <Text variant="small" style={{ color }}>{label}</Text>
    </Pressable>
  );
}
