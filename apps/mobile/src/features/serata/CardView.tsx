import type { Ref } from "react";
import { View, type HostInstance } from "react-native";
import { MediaPoster } from "@/ui/MediaPoster";
import { Text } from "@/ui/Text";
import { fonts, palettes } from "@/theme";
import { cardLayout, qrRuns, titleSize, wrapLines, type Variant } from "./card-spec";

/** What the card says, already translated (the strings come from the screen so this stays a plain drawing). */
export type CardData = {
  title: string;
  year: number | null;
  posterPath: string | null;
  kicker: string;
  meta: string;
  caption: string;
  url: string;
  locale: string;
  qr: boolean[][];
};

/** The card always uses the dark Pellicola colours (like the v1 card-theme): it travels to places that have no theme. */
export const CARD = { ground: palettes.dark.paper, ink: palettes.dark.ink, muted: palettes.dark.muted, accent: palettes.dark.accent, rule: palettes.dark.rule, qrDark: palettes.dark.paper, qrLight: palettes.dark.ink };

export const QUIET = 2;

/**
 * The card as React Native views at `scale` of the design size. On screen it is the preview; on Android and iOS the very same view is
 * captured with react-native-view-shot into the PNG that is shared. (On web the PNG is drawn on a canvas from the same layout, card-image.ts.)
 */
export function CardView({ variant, data, scale, viewRef }: { variant: Variant; data: CardData; scale: number; viewRef?: Ref<HostInstance> }) {
  const L = cardLayout(variant);
  const s = (n: number) => n * scale;
  const size = titleSize(variant, data.title);
  const lines = wrapLines(data.title.toLocaleUpperCase(data.locale), L.title.width, size, L.title.maxLines);
  const modules = data.qr.length + QUIET * 2;
  const unit = L.qr.w / modules;
  return (
    <View ref={viewRef} collapsable={false} accessibilityRole="image" aria-label={data.title} style={{ width: s(L.w), height: s(L.h), backgroundColor: CARD.ground, overflow: "hidden" }}>
      <View style={{ position: "absolute", left: s(L.poster.x), top: s(L.poster.y) }}>
        <MediaPoster title={data.title} path={data.posterPath} width={s(L.poster.w)} size="w500" />
      </View>
      <Text style={{ position: "absolute", left: s(L.wordmark.x), top: s(L.wordmark.y), color: CARD.accent, fontFamily: fonts.display400, fontSize: s(L.wordmark.size), lineHeight: s(L.wordmark.size * 1.1), textTransform: "uppercase" }}>
        Pausa
      </Text>
      <Text style={{ position: "absolute", left: s(L.kicker.x), top: s(L.kicker.y), width: s(L.kicker.width), color: CARD.muted, fontFamily: fonts.body600, fontSize: s(L.kicker.size), lineHeight: s(L.kicker.size * 1.3), letterSpacing: s(3), textTransform: "uppercase" }}>
        {data.kicker}
      </Text>
      <Text
        style={{ position: "absolute", left: s(L.title.x), top: s(L.title.y), width: s(L.title.width), color: CARD.ink, fontFamily: fonts.display200, fontSize: s(size), lineHeight: s(size * 1.02), textTransform: "uppercase" }}
        numberOfLines={L.title.maxLines}
      >
        {lines.join("\n")}
      </Text>
      <Text style={{ position: "absolute", left: s(L.meta.x), top: s(L.meta.y), width: s(L.meta.width), color: CARD.muted, fontFamily: fonts.body400, fontSize: s(L.meta.size), lineHeight: s(L.meta.size * 1.3) }} numberOfLines={2}>
        {data.meta}
      </Text>
      <View style={{ position: "absolute", left: s(L.qr.x), top: s(L.qr.y), width: s(L.qr.w), height: s(L.qr.h), backgroundColor: CARD.qrLight }}>
        {qrRuns(data.qr).map(([r, c, len]) => (
          <View key={`${r}-${c}`} style={{ position: "absolute", left: s((c + QUIET) * unit), top: s((r + QUIET) * unit), width: s(len * unit) + 0.5, height: s(unit) + 0.5, backgroundColor: CARD.qrDark }} />
        ))}
      </View>
      {L.qrCaption ? (
        <Text style={{ position: "absolute", left: s(L.qrCaption.x), top: s(L.qrCaption.y), width: s(L.qrCaption.width), color: CARD.ink, fontFamily: fonts.body400, fontSize: s(L.qrCaption.size), lineHeight: s(L.qrCaption.size * 1.3) }}>
          {data.caption}
        </Text>
      ) : null}
    </View>
  );
}
