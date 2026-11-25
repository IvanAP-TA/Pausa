import { View } from "react-native";

/** A plus drawn with two bars (no icon font, no SVG dependency). Decorative: the control carries the label. */
export function PlusIcon({ size = 22, color }: { size?: number; color: string }) {
  const t = Math.max(2, Math.round(size / 11));
  return (
    <View aria-hidden style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: t, backgroundColor: color }} />
      <View style={{ position: "absolute", width: t, height: size, backgroundColor: color }} />
    </View>
  );
}

/** A chevron from a rotated square corner; `dir` is where it points. */
export function Chevron({ dir = "right", size = 10, color }: { dir?: "left" | "right" | "down"; size?: number; color: string }) {
  const rot = { right: "45deg", left: "-135deg", down: "135deg" }[dir];
  return (
    <View aria-hidden style={{ width: size * 1.6, height: size * 1.6, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size, height: size, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: rot }] }} />
    </View>
  );
}
