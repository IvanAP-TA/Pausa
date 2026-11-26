import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { fallbackSans, fonts, useTheme, web } from "@/theme";
import { Text } from "./Text";

// The same drawing as v1 (src/components/brand.tsx): one frame of film, four sprocket holes down each edge, the pause cut out.
const MARK =
  "M0 0h28v28H0zM2.5 3h3v3.5h-3zM2.5 9.25h3v3.5h-3zM2.5 15.5h3v3.5h-3zM2.5 21.5h3v3.5h-3zM22.5 3h3v3.5h-3zM22.5 9.25h3v3.5h-3zM22.5 15.5h3v3.5h-3zM22.5 21.5h3v3.5h-3zM9.5 7h3.5v14H9.5zM15 7h3.5v14H15z";

/** The Pausa mark, in the signal colour; the cuts show whatever lies behind. Decorative. */
export function PauseMark({ size = 20 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <Path d={MARK} fill={c.accent} fillRule="evenodd" />
    </Svg>
  );
}

/** The wordmark: the mark and the name in display capitals. The mark is 0.84 of the type size, the gap 0.32 of it. */
export function Wordmark({ size = 27.6, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: Math.round(size * 0.32) }, style]}>
      <PauseMark size={Math.round(size * 0.84)} />
      <Text
        style={[
          { fontFamily: fonts.display400, fontSize: size, lineHeight: size, color: c.ink, textTransform: "uppercase" },
          web({ fontFamily: `${fonts.display400}, ${fallbackSans}`, letterSpacing: "-0.005em", fontSynthesis: "none" }),
        ]}
      >
        Pausa
      </Text>
    </View>
  );
}
