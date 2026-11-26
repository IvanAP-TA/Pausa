import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, space, useTheme } from "@/theme";
import { Arrive } from "./motion";
import { Safelight } from "./Safelight";

/**
 * A private screen: a scrolling column on the ground, content capped at a reading width. Keyboard taps pass through to the
 * buttons while a field is focused, and the column pads itself under the notch and the gesture bar.
 */
export function Screen({
  children,
  width = 720,
  style,
  onRefresh,
  refreshing = false,
  onNearEnd,
}: {
  children: ReactNode;
  width?: number;
  style?: StyleProp<ViewStyle>;
  /** Pull to refresh (native; web has no gesture for it, screens that need it offer a button). */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Called when the scroll gets within a screen of the end: infinite lists load the next page here. */
  onNearEnd?: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.paper }}
      contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingBottom: space.xl + insets.bottom }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
      scrollEventThrottle={onNearEnd ? 100 : undefined}
      onScroll={
        onNearEnd
          ? (e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              if (contentSize.height > 0 && contentOffset.y + layoutMeasurement.height >= contentSize.height - layoutMeasurement.height) onNearEnd();
            }
          : undefined
      }
    >
      <Safelight />
      <Arrive style={[{ width: "100%", maxWidth: width, paddingHorizontal: layout.gutter.phone, paddingTop: space.lg + insets.top, gap: space.lg }, style]}>{children}</Arrive>
    </ScrollView>
  );
}

/** A vertical stack with the design gap. */
export function Stack({ gap = space.md, children, style }: { gap?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
