import type { Ref, RefObject } from "react";
import type { HostInstance } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { SIZES, type Variant } from "./card-spec";
import type { CardData } from "./CardView";

/** Android / iOS: the card's own view is captured at full size by react-native-view-shot into a PNG file, then handed to the share sheet. */
export type ExportOutcome = "shared" | "downloaded" | "cancelled";
export type ExportInput = { variant: Variant; data: CardData; viewRef?: Ref<HostInstance>; saveOnly?: boolean; fileName: string };

export async function exportCard({ variant, viewRef }: ExportInput): Promise<ExportOutcome> {
  const target = viewRef as RefObject<HostInstance | null> | undefined;
  if (!target?.current) throw new Error("the card is not on screen yet");
  const { w, h } = SIZES[variant];
  const uri = await captureRef(target, { format: "png", quality: 1, result: "tmpfile", width: w, height: h });
  if (!(await Sharing.isAvailableAsync())) return "cancelled";
  await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Pausa" });
  return "shared";
}
