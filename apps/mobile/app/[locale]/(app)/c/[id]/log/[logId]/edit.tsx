import { useLocalSearchParams } from "expo-router";
import { privateMetadata } from "@/seo/metadata";
import { LogEdit } from "@/features/diary/LogForm";

export const generateMetadata = () => privateMetadata("Pausa");

/** v1 `c/:circleId/l/:logId/edit`: the author edits the viewing without leaving the Cerchia. */
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LogEdit circleId={String(id)} />;
}
