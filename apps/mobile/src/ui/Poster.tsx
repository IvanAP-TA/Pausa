import { View } from "react-native";
import { fonts, useTheme, type ColorName } from "@/theme";
import { tintIndex } from "./Poster-seed";
import { Text } from "./Text";

export { tintIndex };

const TINTS: ColorName[] = ["tint1", "tint2", "tint3", "tint4", "tint5", "tint6", "tint7", "tint8"];

/** Placeholder for a poster or cover that is not there: square, no frame, one of eight deep dyes, the initials in display type. */
export function Poster({ title, size = 56 }: { title: string; size?: number }) {
  const { c } = useTheme();
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <View
      role="img"
      aria-label={title}
      style={{ width: size, height: size, backgroundColor: c[TINTS[tintIndex(title)]], alignItems: "center", justifyContent: "center" }}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        aria-hidden
        style={{ color: c.onTint, fontFamily: fonts.display400, fontSize: size * 0.42, lineHeight: size * 0.5 }}
      >
        {initials}
      </Text>
    </View>
  );
}
