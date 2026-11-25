import { Link, usePathname, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { breakpoints, control, hair, space, useTheme, web } from "@/theme";
import { PlusIcon } from "@/ui/Icons";
import { Text, Title } from "@/ui/Text";
import { useCurrentCircle } from "./current-circle";
import { Bell } from "./Bell";
import { useDocumentTitle } from "./doc-title";
import { UpdateBanner } from "./offline/UpdateBanner";
import { useSession } from "./session";

type Item = {
  key: string;
  label: string;
  /** Where it goes. Undefined = not built yet: shown dimmed, announced as "coming soon", not pressable. */
  href?: string;
  active: boolean;
};

function useItems(): { left: Item[]; right: Item[]; log: Item } {
  const { t, href } = useI18n();
  const path = usePathname();
  const { circleId } = useCurrentCircle();
  const home = href("/home");
  const serata = circleId ? href(`/c/${circleId}/serate`) : home;
  const onSerata = /^\/(it|en|es)\/(c\/[^/]+\/serate|s\/)/.test(path);
  const onMe = path.startsWith(href("/me")) || path === href("/account");
  const onLog = path === href("/log") || path.startsWith(href("/log/"));
  const onDiary = path === href("/diary");
  const circles = !onSerata && !onMe && !onLog && !onDiary && (path === home || path.startsWith(href("/c/")) || path.startsWith(href("/t/")) || path.startsWith(href("/notifications")));
  return {
    left: [
      { key: "circles", label: t("app.nav.circles"), href: home, active: circles },
      { key: "diary", label: t("tabs.diary"), href: href("/diary"), active: onDiary },
    ],
    log: { key: "log", label: t("tabs.logShort"), href: href("/log"), active: onLog },
    right: [
      { key: "serata", label: t("tabs.serata"), href: serata, active: onSerata },
      { key: "profile", label: t("tabs.profile"), href: href("/me"), active: onMe },
    ],
  };
}

function Tab({ item, rail }: { item: Item; rail?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const soon = item.href === undefined;
  const color = soon ? c.muted : item.active ? c.ink : c.ink2;
  const body = (
    <Pressable
      role={soon ? "button" : "link"}
      aria-label={soon ? t("app.nav.soon", { label: item.label }) : item.label}
      aria-current={item.active ? "page" : undefined}
      aria-disabled={soon || undefined}
      disabled={soon}
      style={StyleSheet.flatten([
        {
          flex: rail ? undefined : 1,
          minHeight: control,
          justifyContent: "center",
          alignItems: rail ? "flex-start" : "center",
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
          // The current tab lights a 2px stretch of the hairline it sits against: the top edge of the bar, the right edge of the rail.
          ...(rail
            ? { borderRightWidth: item.active ? 2 : 0, borderColor: c.accent }
            : { borderTopWidth: item.active ? 2 : 0, borderColor: c.accent, marginTop: item.active ? -2 : 0 }),
        },
        web({ cursor: soon ? "default" : "pointer" }),
      ])}
    >
      <Title style={{ color, fontSize: 20, lineHeight: 24 }}>{item.label}</Title>
    </Pressable>
  );
  return soon ? body : (
    <Link href={item.href as Href} asChild>
      {body}
    </Link>
  );
}

function LogTab({ item, rail }: { item: Item; rail?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Link href={item.href as Href} asChild>
      <Pressable
        role="link"
        aria-label={t("tabs.log")}
        aria-current={item.active ? "page" : undefined}
        style={StyleSheet.flatten([
          { minWidth: 72, minHeight: control + 8, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm, flexDirection: rail ? "row" : "column", gap: space["2xs"], borderWidth: rail ? hair : 0, borderColor: item.active ? c.accent : c.rule },
          web({ cursor: "pointer" }),
        ])}
      >
        <PlusIcon color={c.accent} />
        <Title style={{ color: item.active ? c.ink : c.ink2, fontSize: 18, lineHeight: 20 }}>{rail ? t("tabs.log") : item.label}</Title>
      </Pressable>
    </Link>
  );
}

/** The slim page header of every signed-in screen: where you are (the Cerchia in use) and the bell. */
function Header() {
  const { c } = useTheme();
  const { href } = useI18n();
  const { circle } = useCurrentCircle();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingLeft: space.md, paddingRight: space.xs, paddingTop: insets.top, borderBottomWidth: hair, borderColor: c.rule, minHeight: control + insets.top }}>
      <Link href={href("/home") as Href} asChild>
        <Pressable role="link" aria-label={circle ? circle.name : "Pausa"} style={StyleSheet.flatten([{ flex: 1, minHeight: control, justifyContent: "center" }, web({ cursor: "pointer" })])}>
          <Text variant="strong" numberOfLines={1} tone="ink2">
            {circle ? circle.name : "Pausa"}
          </Text>
        </Pressable>
      </Link>
      <Bell />
    </View>
  );
}

/** The private shell fills exactly the window and scrolls inside (web: bounded height, so the tab bar stays put). */
// (Web: an explicit height, not flex:1, because #root only has a min-height and a percentage flex-basis would resolve to the content.)
const frame = (bg: string): ViewStyle[] => [{ backgroundColor: bg }, Platform.OS === "web" ? ({ height: "100dvh", overflow: "hidden" } as ViewStyle) : { flex: 1 }];

/** Phones: bottom bar `1fr auto 1fr`, two tabs, the centred Registra, two tabs. From 64rem: a rail on the left. */
export function Shell({ children }: { children: ReactNode }) {
  useDocumentTitle();
  const { c } = useTheme();
  const { t, href } = useI18n();
  const { state } = useSession();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const items = useItems();
  const path = usePathname();
  // The bar is for signed-in screens; sign-in and the invite landing stand alone.
  const bare = state.status !== "ready" || path === href("/sign-in") || path.startsWith(href("/join/"));
  if (bare) return <View style={frame(c.paper)}><UpdateBanner />{children}</View>;

  if (width >= breakpoints.rail) {
    return (
      <View style={[frame(c.paper), { flexDirection: "row" }]}>
        <View role="navigation" aria-label={t("app.nav.label")} style={{ width: 240, borderRightWidth: hair, borderColor: c.rule, paddingTop: space.lg + insets.top, gap: space.xs }}>
          <Link href={href("/home") as Href} aria-label={t("app.nav.home")} style={{ paddingHorizontal: space.sm, paddingBottom: space.md }}>
            <Title style={{ fontSize: 32, lineHeight: 38 }}>Pausa</Title>
          </Link>
          {[...items.left, items.log, ...items.right].map((it) => (it.key === "log" ? <LogTab key={it.key} item={it} rail /> : <Tab key={it.key} item={it} rail />))}
        </View>
        <View style={{ flex: 1 }}>
          <Header />
          <UpdateBanner />
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={frame(c.paper)}>
      <Header />
      <UpdateBanner />
      <View style={{ flex: 1 }}>{children}</View>
      <View
        role="navigation"
        aria-label={t("app.nav.label")}
        style={{ flexDirection: "row", alignItems: "stretch", borderTopWidth: hair, borderColor: c.rule, backgroundColor: c.paper, paddingBottom: insets.bottom }}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>{items.left.map((it) => <Tab key={it.key} item={it} />)}</View>
        <LogTab item={items.log} />
        <View style={{ flex: 1, flexDirection: "row" }}>{items.right.map((it) => <Tab key={it.key} item={it} />)}</View>
      </View>
    </View>
  );
}
