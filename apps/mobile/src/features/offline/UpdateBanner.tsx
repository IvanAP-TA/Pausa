import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { updateStore } from "@/pwa/update-store";
import { Button } from "@/ui/Button";
import { Text } from "@/ui/Text";
import "./offline.messages";

/**
 * "Update available": a new service worker is waiting (web only; native never raises it). One tap activates it and the page reloads.
 * It sits under the header, announced politely once, and never reloads on its own.
 */
export function UpdateBanner() {
  const { t } = useI18n();
  const { c } = useTheme();
  const ready = useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot, updateStore.getServerSnapshot);
  if (!ready) return null;
  return (
    <View
      role="status"
      testID="update-banner"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: c.paper3, borderBottomWidth: hair, borderColor: c.rule }}
    >
      <Text variant="strong" style={{ flex: 1 }}>
        {t("offline.update.available")}
      </Text>
      <Button label={t("offline.update.cta")} accessibilityLabel={t("offline.update.ctaLabel")} onPress={() => updateStore.apply()} testID="update-apply" />
    </View>
  );
}
