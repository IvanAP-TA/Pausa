import { View } from "react-native";
import { space, useTheme } from "@/theme";

/** What the private shell shows until its strings are in: the ground and still bars, no text (so no locale is needed, and the static HTML hydrates cleanly). */
export function ShellFallback() {
  const { c } = useTheme();
  return (
    <View aria-busy style={{ flex: 1, backgroundColor: c.paper, padding: space.md, gap: space.md }}>
      <View style={{ height: 44, backgroundColor: c.paper3 }} />
      <View style={{ height: 44, backgroundColor: c.paper3 }} />
    </View>
  );
}
