// Web facade over ./motion-impl (Reanimated). Reanimated alone is ~30% of the app's code and the shell must be quick to load, so on
// web it is a separate chunk fetched AFTER the first paint (`loadMotion`, called by the app layout), and never fetched at all
// for people who asked for reduced motion. A component decides once, at mount, whether it animates: screens opened after the chunk
// is there arrive with the fade; the very first screen is simply there. Nothing remounts when the chunk lands (a form must not
// lose what was typed), so there is no Suspense swap.
import { useState, type ComponentProps } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

type Impl = typeof import("./motion-impl");

let impl: Impl | null = null;
let loading: Promise<void> | null = null;

const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Starts downloading the animation chunk, unless the person asked for reduced motion. Safe to call many times. */
export function loadMotion(): Promise<void> {
  if (impl || prefersReducedMotion()) return Promise.resolve();
  loading ??= import("./motion-impl").then(
    (m) => {
      impl = m;
    },
    () => {
      loading = null; // offline: try again at the next call
    },
  );
  return loading;
}

export function Arrive(props: ComponentProps<Impl["Arrive"]>) {
  const [I] = useState(() => impl);
  return I ? <I.Arrive {...props} /> : <View style={props.style}>{props.children}</View>;
}

export function Stagger(props: ComponentProps<Impl["Stagger"]>) {
  const [I] = useState(() => impl);
  return I ? <I.Stagger {...props} /> : <View style={props.style}>{props.children}</View>;
}

export function Skeleton({ width = "100%", height = 20, style }: { width?: ViewStyle["width"]; height?: number; style?: StyleProp<ViewStyle> }) {
  const [I] = useState(() => impl);
  // Still bar: same size and colour as the pulsing one, just not pulsing. (Colour comes from the same token.)
  return I ? <I.Skeleton width={width} height={height} style={style} /> : <StillBar width={width} height={height} style={style} />;
}

function StillBar({ width, height, style }: { width: ViewStyle["width"]; height: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View aria-hidden style={[{ width, height, backgroundColor: c.paper3 }, style]} />;
}
