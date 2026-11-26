import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { fallbackSans, fonts, hair, space, useTheme, web } from "@/theme";
import { Text } from "@/ui/Text";

/** Pieces of v1's Serata screens that more than one phase uses: the plate, the bracket bar, the figures, the poster grid. */

/** `.plate`: a hairline over the block, with the space under it. */
export function Plate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.md }, style]}>{children}</View>;
}

/** `.figure`: display capitals 200, proportional digits. `size` in px. */
export function figure(size: number): TextStyle {
  return { fontFamily: fonts.display200, fontSize: size, lineHeight: Math.round(size * 1.02), textTransform: "uppercase", fontWeight: "normal", ...web({ fontFamily: `${fonts.display200}, ${fallbackSans}`, fontSynthesis: "none", fontVariant: "lining-nums proportional-nums" }) };
}

/** `.title`: display capitals 400, for the names of titles. */
export function titleType(size: number): TextStyle {
  return { fontFamily: fonts.display400, fontSize: size, lineHeight: Math.round(size * 1.05), textTransform: "uppercase", fontWeight: "normal", ...web({ fontFamily: `${fonts.display400}, ${fallbackSans}`, fontSynthesis: "none", letterSpacing: "-0.005em" }) };
}

/** BracketBar: one hairline segment per match, the past ones muted, the current one in the signal colour. Decorative. */
export function BracketBar({ done, total }: { done: number; total: number }) {
  const { c } = useTheme();
  return (
    <View aria-hidden style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 2, backgroundColor: i < done ? c.muted : i === done ? c.accent : c.rule }} />
      ))}
    </View>
  );
}

/** Squares for the dots: filled in the signal colour up to `n`, the empty ones in the rule colour; always at least `min` of them. */
export function DotMarks({ n, min }: { n: number; min: number }) {
  const { c } = useTheme();
  return (
    <View aria-hidden style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: Math.max(min, n) }, (_, i) => (
        <View key={i} style={{ width: 10, height: 10, backgroundColor: i < n ? c.accent : c.rule }} />
      ))}
    </View>
  );
}

/**
 * `cols` equal columns with `gap` between them, measured: the cell width is what a poster should be. Before the first measure it is 0
 * and nothing is drawn (so no poster jumps from one size to another).
 */
export function useGrid(cols: number, gap: number) {
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? Math.floor((width - gap * (cols - 1)) / cols) : 0;
  return {
    cell,
    onLayout: (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)),
    style: { flexDirection: "row", flexWrap: "wrap", columnGap: gap, rowGap: space.md } as ViewStyle,
  };
}

/** The year as a small line under a title, "movie, 1999" as v1 does. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <Text variant="small" tone="muted">
      {children}
    </Text>
  );
}
