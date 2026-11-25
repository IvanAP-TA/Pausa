import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "./Button";
import { Heading } from "./Text";

/**
 * A bottom sheet on phones, a centred panel on wide screens. No slide animation on purpose (nothing to reduce); the scrim and the
 * close button dismiss it, Escape too (the platform Modal wires it). Content scrolls inside.
 */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 640;
  return (
    // On web the Modal itself is the `role="dialog"` (react-native-web spreads unknown props onto it): name that one, do not nest a second dialog.
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent {...({ "aria-label": title } as object)}>
      <View style={{ flex: 1, justifyContent: wide ? "center" : "flex-end", alignItems: "center" }}>
        {/* The scrim closes on a tap, for the pointer. For keyboard and screen readers the real "Close" button below does it (and Escape): this one is not a tab stop and not in the tree. */}
        <Pressable accessible={false} focusable={false} tabIndex={-1} aria-hidden onPress={onClose} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim }} />
        <View
          accessibilityViewIsModal
          style={{ width: "100%", maxWidth: 560, maxHeight: Math.round(height * 0.88), backgroundColor: c.paper, borderTopWidth: hair, borderWidth: wide ? hair : 0, borderColor: c.rule, paddingBottom: insets.bottom }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md }}>
            <Heading level={2} style={{ flex: 1, fontSize: 28, lineHeight: 32 }}>
              {title}
            </Heading>
            <Button label={t("app.close")} variant="quiet" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.md, gap: space.md }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
