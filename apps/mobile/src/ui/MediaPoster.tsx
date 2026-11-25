import { useState } from "react";
import { Image, View } from "react-native";
import { fonts, useTheme, type ColorName } from "@/theme";
import { tintIndex } from "./Poster-seed";
import { Text } from "./Text";

const TINTS: ColorName[] = ["tint1", "tint2", "tint3", "tint4", "tint5", "tint6", "tint7", "tint8"];

/**
 * Where a poster lives. A TMDB path (`/abc.jpg`) is served by image.tmdb.org at a width; an imported anime comes with a whole
 * https URL (AniList) that is used as it is. `null` = no artwork.
 */
export function posterUrl(path: string | null, width: "w92" | "w185" | "w342" | "w500" = "w342"): string | null {
  if (!path) return null;
  if (path.startsWith("https://")) return path;
  return /^\/[\w-]+\.(jpg|png)$/.test(path) ? `https://image.tmdb.org/t/p/${width}${path}` : null;
}

/**
 * A poster at 2:3. When there is no artwork, or it cannot be loaded (offline, a path the catalogue no longer has), the same box is
 * filled by one of the eight deep dyes with the title's initials, so a list never has holes. `decorative` hides it from screen
 * readers when the title is written next to it.
 */
export function MediaPoster({ title, path, width = 56, decorative = true, size = "w185" }: { title: string; path: string | null; width?: number; decorative?: boolean; size?: "w92" | "w185" | "w342" | "w500" }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = posterUrl(path, size);
  const height = Math.round(width * 1.5);
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": title };
  if (uri && !failed) {
    return (
      <View {...a11y} style={{ width, height, backgroundColor: c.paper3 }}>
        <Image source={{ uri }} onError={() => setFailed(true)} resizeMode="cover" style={{ width, height }} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <View {...a11y} style={{ width, height, backgroundColor: c[TINTS[tintIndex(title)]], alignItems: "center", justifyContent: "center" }}>
      <Text aria-hidden maxFontSizeMultiplier={1.2} style={{ color: c.onTint, fontFamily: fonts.display400, fontSize: width * 0.4, lineHeight: width * 0.48 }}>
        {initials}
      </Text>
    </View>
  );
}
