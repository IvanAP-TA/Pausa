import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { useTheme } from "@/theme";

// v1's speck grain without the feTurbulence filter (too costly on a phone): one 96px tile of deterministic 1px specks, drawn
// once as an SVG pattern and repeated by the renderer. Nothing animates and nothing is measured, so there is no cost per frame.
const TILE = 96;
const SPECKS = (() => {
  let seed = 0x2f6e2b1;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 110 }, () => ({ x: Math.floor(next() * TILE), y: Math.floor(next() * TILE), o: 0.35 + next() * 0.65 }));
})();

const OPACITY = 0.12; // v1 --grain on a phone

/** Absolute-fill speck layer for a `Well grained`: white specks on dark paper, ink specks on light paper. Put it first in the well. */
export const Grain = memo(function Grain() {
  const { scheme } = useTheme();
  const fill = scheme === "light" ? "#000" : "#fff";
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: OPACITY, overflow: "hidden" }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="speck" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            {SPECKS.map((p, i) => (
              <Rect key={i} x={p.x} y={p.y} width={1} height={1} fill={fill} fillOpacity={p.o} />
            ))}
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#speck)" />
      </Svg>
    </View>
  );
});
