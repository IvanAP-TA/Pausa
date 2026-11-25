// All animation goes through Reanimated, and all of it asks `useReducedMotion` first: with reduced motion the content is simply
// there (no fade, no rise, no pulse). Only transform and opacity move, never size or position (DESIGN.md "Motion").
// Shared values + useAnimatedStyle, not the `entering` layout-animation presets: on web those leave `position:absolute` on the
// element (measured: a whole list collapsed to 1px), and they are the heaviest part of the library.
import { useEffect, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { motion, useTheme } from "@/theme";

const ease = Easing.bezier(...motion.easeOut);

/** 0 -> 1 over `motion.short` after `delay`; opacity follows it, and the element rises `rise` dp into place. */
function useArrival(delay: number, rise: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: motion.short, easing: ease }));
  }, [delay, p]);
  return useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * rise }] }));
}

function Arriving({ delay, rise, children, style }: { delay: number; rise: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const anim = useArrival(delay, rise);
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A page arrives in one 220ms fade. */
export function Arrive({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  if (reduced) return <View style={style}>{children}</View>;
  return (
    <Arriving delay={0} rise={0} style={style}>
      {children}
    </Arriving>
  );
}

/** The first eight rows of a list rise one after the other, 45ms apart; the rest are simply there. */
export function Stagger({ index, children, style }: { index: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  if (reduced || index >= 8) return <View style={style}>{children}</View>;
  return (
    <Arriving delay={index * 45} rise={6} style={style}>
      {children}
    </Arriving>
  );
}

/** A quiet placeholder bar; it pulses only when motion is allowed. */
export function Skeleton({ width = "100%", height = 20, style }: { width?: ViewStyle["width"]; height?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.55, { duration: 900, easing: ease }), -1, true);
  }, [reduced, o]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View aria-hidden style={[{ width, height, backgroundColor: c.paper3 }, reduced ? null : animated, style]} />;
}

/** Native: Reanimated is already in the bundle. */
export const loadMotion = async () => undefined;
