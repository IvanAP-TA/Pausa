// Android / iOS: the card is a real view on screen, captured to a PNG with react-native-view-shot and handed to the share sheet.
import type { RefObject } from "react";
import type { HostInstance } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import type { ShareOutcome, YearCard } from "./year-card-types";

export async function shareYearCard(card: YearCard, view?: RefObject<HostInstance | null>): Promise<ShareOutcome> {
  if (!view?.current) throw new Error("the card is not on screen");
  const uri = await captureRef(view as unknown as Parameters<typeof captureRef>[0], { format: "png", quality: 1, result: "tmpfile", fileName: card.fileName.replace(/\.png$/, "") });
  await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: card.shareText });
  return "shared";
}
