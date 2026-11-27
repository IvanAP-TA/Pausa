import { useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "./Button";

/**
 * A destructive action in two presses: the first only asks, the second (a different label that says what will happen)
 * does it. Cancel puts it back. Never a single tap that deletes something.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, busy, accessibilityLabel }: { label: string; confirmLabel: string; onConfirm: () => void; busy?: boolean; accessibilityLabel?: string }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button label={label} variant="quiet" accessibilityLabel={accessibilityLabel} onPress={() => setAsking(true)} />;
  return (
    // maxWidth: inside a wrapping row of buttons it must wrap itself, not push "Annulla" off the screen.
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, maxWidth: "100%" }}>
      <Button label={confirmLabel} variant="danger" busy={busy} onPress={onConfirm} />
      <Button label={t("app.cancel")} variant="quiet" onPress={() => setAsking(false)} />
    </View>
  );
}
