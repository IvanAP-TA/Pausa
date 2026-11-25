import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "@/i18n";
import { control, space, useTheme, web } from "@/theme";
import { Text } from "@/ui/Text";
import { useSession } from "./session";

/** A bell drawn with a few boxes (no icon font): the dome, the rim, the clapper. */
function BellIcon({ color }: { color: string }) {
  return (
    <View aria-hidden style={{ width: 22, height: 22, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ width: 14, height: 13, borderWidth: 2, borderBottomWidth: 0, borderColor: color, borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
      <View style={{ width: 20, height: 2, backgroundColor: color }} />
      <View style={{ width: 6, height: 3, backgroundColor: color, marginTop: 1 }} />
    </View>
  );
}

/** Unread notices across the Cerchie, from `/api/me` (reloaded by the session whenever something marks them read). */
export function useUnread(): number {
  const { state } = useSession();
  return state.status === "ready" ? state.me.circles.reduce((n, c) => n + c.unread, 0) : 0;
}

export function Bell() {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const unread = useUnread();
  return (
    <Link href={href("/notifications") as Href} asChild>
      <Pressable
        role="link"
        aria-label={unread > 0 ? `${t("notifications.title")}: ${t("feed.unread", { count: unread })}` : t("notifications.title")}
        testID="bell"
        style={StyleSheet.flatten([{ minWidth: control, minHeight: control, alignItems: "center", justifyContent: "center" }, web({ cursor: "pointer" })])}
      >
        <BellIcon color={c.ink2} />
        {unread > 0 ? (
          <View testID="bell-badge" style={{ position: "absolute", top: 4, right: 2, minWidth: 20, height: 20, paddingHorizontal: space["2xs"], backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
            <Text variant="small" style={{ color: c.accentInk, fontSize: 12, lineHeight: 16 }} maxFontSizeMultiplier={1.2} aria-hidden>
              {unread > 99 ? "99+" : unread}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}
