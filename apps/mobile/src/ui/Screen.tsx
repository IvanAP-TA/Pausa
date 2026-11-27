import { useEffect, useRef, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
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
  // Web: the document scrolls (Shell.tsx), not this ScrollView, so "near the end" is measured on the window.
  const nearEnd = useRef(onNearEnd);
  nearEnd.current = onNearEnd;
  const wantsNearEnd = !!onNearEnd;
  useEffect(() => {
    if (Platform.OS !== "web" || !wantsNearEnd || typeof window === "undefined") return;
    const check = () => {
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - window.innerHeight) nearEnd.current?.();
    };
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [wantsNearEnd]);
  const inner = (
    <>
      <Safelight />
      <Arrive style={[{ width: "100%", maxWidth: width, paddingHorizontal: layout.gutter.phone, paddingTop: space.lg + insets.top, gap: space.lg }, style]}>{children}</Arrive>
    </>
  );
  // Web: a plain column. A ScrollView is an overflow:auto box even when it does not scroll, and that box would capture every
  // position:sticky inside the screen (the Serata and Registra footers) instead of the window.
  if (Platform.OS === "web") {
    return <View style={{ flexGrow: 1, alignItems: "center", backgroundColor: c.paper, paddingBottom: space.xl + insets.bottom }}>{inner}</View>;
  }
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
      {inner}
    </ScrollView>
  );
}

/** A vertical stack with the design gap. */
export function Stack({ gap = space.md, children, style }: { gap?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}
