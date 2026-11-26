import { useState } from "react";
import { Image, View } from "react-native";
import { fonts, radius, useTheme, type ColorName } from "@/theme";
import { tintIndex } from "./Poster-seed";
import { Glyph } from "./Glyph";

const TINTS: ColorName[] = ["tint1", "tint2", "tint3", "tint4", "tint5", "tint6", "tint7", "tint8"];

/** `emoji:🍿` is a picked glyph, an https URL is a photo, anything else (null) falls back to the person's initial. */
export function Avatar({ name, image, size = 40 }: { name: string; image?: string | null; size?: number }) {
  const { c } = useTheme();
  const [broken, setBroken] = useState(false);
  const frame = { width: size, height: size, borderRadius: radius.avatar, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const };
  if (image?.startsWith("emoji:"))
    return (
      <View aria-hidden style={[frame, { backgroundColor: c.paper3 }]}>
        <Glyph style={{ fontSize: size * 0.52, lineHeight: size * 0.7, textAlign: "center" }}>{image.slice(6)}</Glyph>
      </View>
    );
  if (image?.startsWith("https://") && !broken)
    return (
      <View aria-hidden style={frame}>
        <Image source={{ uri: image }} style={{ width: size, height: size }} onError={() => setBroken(true)} />
      </View>
    );
  const initial = name.trim().slice(0, 1).toUpperCase();
  return (
    <View aria-hidden style={[frame, { backgroundColor: c[TINTS[tintIndex(name)]] }]}>
      <Glyph style={{ color: c.onTint, fontFamily: fonts.display400, fontSize: size * 0.48, lineHeight: size * 0.6 }}>{initial}</Glyph>
    </View>
  );
}
