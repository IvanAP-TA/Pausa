import { View } from "react-native";
import { useTheme } from "@/theme";
import { Chevron } from "./Icons";
import { TextLink } from "./TextLink";

/** "‹ label" back to a parent screen. */
export function BackLink({ to, label }: { to: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Chevron dir="left" color={c.ink2} />
      <TextLink href={to} tone="ink2">
        {label}
      </TextLink>
    </View>
  );
}
