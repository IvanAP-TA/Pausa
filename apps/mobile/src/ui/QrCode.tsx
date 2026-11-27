import { View } from "react-native";
import { qrMatrix } from "@/features/serata/qr";
import { qrRuns } from "@/features/serata/card-spec";

const QUIET = 4;

/**
 * A QR code drawn with plain views (one per run of dark modules), dark on white whatever the theme: phone cameras read it
 * best that way. `label` is what a screen reader says (the image's purpose); the link itself is next to it as text.
 */
export function QrCode({ text, size = 200, label, testID }: { text: string; size?: number; label: string; testID?: string }) {
  const matrix = qrMatrix(text, "M");
  const modules = matrix.length + QUIET * 2;
  const unit = size / modules;
  return (
    <View role="img" aria-label={label} testID={testID} style={{ width: size, height: size, backgroundColor: "#ffffff" }}>
      {qrRuns(matrix).map(([r, c, len]) => (
        <View
          key={`${r}-${c}`}
          style={{ position: "absolute", left: (c + QUIET) * unit, top: (r + QUIET) * unit, width: len * unit + 0.5, height: unit + 0.5, backgroundColor: "#000000" }}
        />
      ))}
    </View>
  );
}
