import { View } from "react-native";
import { MediaPoster } from "@/ui/MediaPoster";
import { useTheme } from "@/theme";

const GAP = 3;

/** Up to four posters in a 2x2 block (the list's cover). With none, one dye block with the list's initials stands in. */
export function Collage({ name, posters, size = 40 }: { name: string; posters: string[]; size?: number }) {
  const { c } = useTheme();
  const shown = posters.slice(0, 4);
  const w = size * 2 + GAP;
  const h = Math.round(size * 1.5) * 2 + GAP;
  if (shown.length === 0) return <MediaPoster title={name} path={null} width={w} />;
  if (shown.length === 1) return <MediaPoster title={name} path={shown[0]} width={w} />;
  return (
    <View aria-hidden style={{ width: w, height: h, flexDirection: "row", flexWrap: "wrap", gap: GAP, backgroundColor: c.paper }}>
      {Array.from({ length: 4 }, (_, i) => (shown[i] ? <MediaPoster key={i} title={`${name} ${i}`} path={shown[i]} width={size} /> : <View key={i} style={{ width: size, height: Math.round(size * 1.5), backgroundColor: c.paper3 }} />))}
    </View>
  );
}
