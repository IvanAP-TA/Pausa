import type { MediaDto } from "@pausa/api-types";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@/theme";
import { MediaPoster } from "@/ui/MediaPoster";
import { Text } from "@/ui";

/** v1 `grid-cols-3 sm:grid-cols-5 gap-3`: the favourites as posters with their title under them (two lines at most). `corner` sits on the poster's top-right. */
export function PosterGrid({ items, corner }: { items: MediaDto[]; corner?: (m: MediaDto) => ReactNode }) {
  const [w, setW] = useState(0);
  const cols = w >= 560 ? 5 : 3;
  const gap = space.sm;
  const cell = w > 0 ? Math.floor((w - gap * (cols - 1)) / cols) : 0;
  return (
    <View role="list" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {cell > 0
        ? items.map((m) => (
            <View key={m.id} role="listitem" testID={`fav-${m.id}`} style={{ width: cell, gap: space["2xs"] }}>
              <View>
                <MediaPoster title={m.title} path={m.posterPath} width={cell} size="w342" />
                {corner ? <View style={{ position: "absolute", top: 0, right: 0 }}>{corner(m)}</View> : null}
              </View>
              <Text variant="small" tone="ink2" numberOfLines={2}>
                {m.title}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}
