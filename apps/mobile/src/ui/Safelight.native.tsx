import { memo } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Mask, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme";

// v1 tokens.css strengths, the phone values (this file only runs on Android and iOS): dark paper 18% / 46%, light paper 7% / 5%.
const STRENGTH = { dark: { light: 0.18, curtain: 0.46 }, light: { light: 0.07, curtain: 0.05 } } as const;
const HEIGHT = 480; // 30rem, as on the web
const MAX_WIDTH = 1152; // min(100vw, 72rem)

/**
 * The safelight and the house curtain on Android and iOS (the web file is `Safelight.tsx`, CSS gradients): the same two layers
 * drawn once with react-native-svg, a radial glow of the signal colour and vertical velvet folds, both faded out before the
 * content by a vertical mask. Static: no animation, no scroll listener, it re-renders only when the theme or the width changes.
 */
export const Safelight = memo(function Safelight() {
  const { c, scheme } = useTheme();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, MAX_WIDTH);
  const s = STRENGTH[scheme];
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: "absolute", zIndex: 0, top: 0, left: (screen - width) / 2, width, height: HEIGHT }}
    >
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="0%" rx="62%" ry="100%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={c.accent} stopOpacity={s.light} />
            <Stop offset="0.72" stopColor={c.accent} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="fold" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset={14 / 46} stopColor="#000" stopOpacity={0} />
            <Stop offset={30 / 46} stopColor="#000" stopOpacity={s.curtain} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </LinearGradient>
          <Pattern id="folds" width={46} height={HEIGHT} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={46} height={HEIGHT} fill="url(#fold)" />
          </Pattern>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.35" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.92" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id="fadeout" x={0} y={0} width={width} height={HEIGHT} maskUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#fade)" />
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#glow)" mask="url(#fadeout)" />
        <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#folds)" mask="url(#fadeout)" />
      </Svg>
    </View>
  );
});
