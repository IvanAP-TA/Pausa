import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "@/i18n";
import { control, fonts, space, useTheme, web } from "@/theme";
import { BellIcon, STROKE } from "@/ui/lucide";
import { usePressed } from "@/ui/usePressed";
import { Glyph } from "@/ui/Glyph";
import { useSession } from "./session";

/** Unread notices across the Cerchie, from `/api/me` (reloaded by the session whenever something marks them read). */
export function useUnread(): number {
  const { state } = useSession();
  return state.status === "ready" ? state.me.circles.reduce((n, c) => n + c.unread, 0) : 0;
}

/** v1 space-switch.tsx: a 44px cell, the lucide bell in ink-2, the count on an accent tab at its top right ("9+" above nine). */
export function Bell() {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const unread = useUnread();
  const { hovered, bind } = usePressed();
  return (
    <Link href={href("/notifications") as Href} asChild>
      <Pressable
        role="link"
        aria-label={unread > 0 ? `${t("notifications.title")}: ${t("feed.unread", { count: unread })}` : t("notifications.title")}
        testID="bell"
        {...bind}
        style={StyleSheet.flatten([
          { width: control, height: control, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? c.paper2 : "transparent" },
          web({ cursor: "pointer", transition: "background-color 120ms cubic-bezier(0.16, 1, 0.3, 1)" }),
        ])}
      >
        <BellIcon size={22} strokeWidth={STROKE} color={hovered ? c.ink : c.ink2} />
        {unread > 0 ? (
          <View testID="bell-badge" aria-hidden style={{ position: "absolute", top: 2, right: 2, minWidth: 20, height: 20, paddingHorizontal: space["2xs"], backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
            <Glyph style={{ color: c.accentInk, fontFamily: fonts.body600, fontSize: 12, lineHeight: 20 }}>{unread > 9 ? "9+" : String(unread)}</Glyph>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}
