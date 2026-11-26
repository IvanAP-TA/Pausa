import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { fallbackSans, fonts, hair, web } from "@/theme";
import { MediaPoster } from "@/ui/MediaPoster";
import { Text } from "@/ui/Text";
import { CARD } from "./CardView";

/**
 * v1's `SerataCard`: the 9:16 one-sheet. The poster runs full-bleed on top (never less than 40% of the height), then the title in
 * hairline capitals, the subtitle, the facts as hairline rows, and at the foot the address and the two amber bars of the pause mark.
 * Fixed colours (the card looks the same in light and dark: it is what leaves the app). Everything is sized from the card's own
 * width, so it is the same picture at 150px (an illustration) and at 340px (the real result).
 */
export function SerataCard({ kicker, title, subtitle, posterPath, lines, testID }: { kicker: string; title: string; subtitle?: string; posterPath: string | null; lines: string[]; testID?: string }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const cq = (n: number) => (w * n) / 100;
  const titleSize = cq(title.length > 36 ? 11 : title.length > 18 ? 14 : 19);
  const row = { borderTopWidth: hair, borderColor: CARD.rule, paddingVertical: cq(1.6) };
  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      <View
        testID={testID}
        style={{ width: "100%", aspectRatio: 9 / 16, borderWidth: hair, borderColor: CARD.rule, backgroundColor: CARD.ground, overflow: "hidden" }}
      >
        <View style={{ flex: 1, minHeight: "40%", backgroundColor: CARD.rule, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {w > 0 ? <MediaPoster title={title} path={posterPath} width={w} size="w500" /> : null}
        </View>
        {w > 0 ? (
          <View style={{ paddingHorizontal: cq(6), paddingVertical: cq(5), gap: cq(2.4) }}>
            <Text
              testID="public-winner"
              role="heading"
              aria-level={2}
              numberOfLines={4}
              style={[{ color: CARD.ink, fontFamily: fonts.display200, fontSize: titleSize, lineHeight: titleSize * 0.98, textTransform: "uppercase", fontWeight: "normal" }, web({ fontFamily: `${fonts.display200}, ${fallbackSans}`, fontSynthesis: "none", textWrap: "balance" })]}
            >
              {title}
            </Text>
            {subtitle ? <Text style={{ color: CARD.ink, fontFamily: fonts.body300, fontSize: Math.max(7, cq(4.6)), lineHeight: Math.max(7, cq(4.6)) * 1.25 }}>{subtitle}</Text> : null}
            <View>
              {[kicker, ...lines].map((l, i) => (
                <Text key={`${i}-${l}`} style={[row, { color: CARD.muted, fontFamily: fonts.body400, fontSize: Math.max(6.5, cq(3.8)), lineHeight: Math.max(6.5, cq(3.8)) * 1.3, fontVariant: ["tabular-nums"] }]}>
                  {l}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: hair, borderColor: CARD.rule, paddingTop: cq(2.4) }}>
              <Text style={{ color: CARD.muted, fontFamily: fonts.body400, fontSize: Math.max(6, cq(3.4)) }}>pausa.gnagno.org</Text>
              <View aria-hidden style={{ flexDirection: "row", gap: cq(0.8) }}>
                <View style={{ width: cq(1.1), height: cq(3.4), backgroundColor: CARD.accent }} />
                <View style={{ width: cq(1.1), height: cq(3.4), backgroundColor: CARD.accent }} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
