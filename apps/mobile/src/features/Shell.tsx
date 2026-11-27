import { Link, usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { breakpoints, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { PauseMark, Wordmark } from "@/ui/Brand";
import { BookOpen, List, Plus, Popcorn, STROKE, Trophy, Users } from "@/ui/lucide";
import { Text } from "@/ui/Text";
import { usePressed } from "@/ui/usePressed";
import { useCurrentCircle } from "./current-circle";
import { Bell } from "./Bell";
import { CircleAside } from "./CircleAside";
import { useDocumentTitle } from "./doc-title";
import { UpdateBanner } from "./offline/UpdateBanner";
import { useSession } from "./session";
import { SpaceButton, SpacePanel, useSpaceMenu } from "./SpaceMenu";

// The frame of every signed-in page, as v1 (src/components/shell.tsx, space-switch.tsx, tab-bar.tsx): the bar on top (the
// mark, the Cerchia I am in as a switch, the bell), the page, and the tabs under the thumb, a rail on the left from 64rem.

type IconType = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
type TabKey = "diary" | "serata" | "ranking" | "lists" | "circle";
const ICONS: Record<TabKey, IconType> = { diary: BookOpen, serata: Popcorn, lists: List, ranking: Trophy, circle: Users };
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Which tab is lit. Pages reached from the diary (a title, an entry, a person, the notifications) keep Diario lit. */
function useActive(circleId: string) {
  const { href } = useI18n();
  const path = usePathname();
  const base = href(`/c/${circleId}`);
  const under = (p: string) => path === p || path.startsWith(`${p}/`);
  const underDiary =
    ["/log", "/people", "/insights"].some((p) => under(`${base}${p}`)) ||
    ["/t", "/notifications", "/import", "/imports"].some((p) => under(href(p)));
  return {
    diary: path === base || underDiary,
    serata: under(`${base}/serate`) || under(href("/s")),
    ranking: under(`${base}/ranking`),
    lists: under(href("/lists")),
    circle: under(`${base}/members`) || under(`${base}/settings`),
    log: under(href("/log")),
    me: under(href("/me")) || under(href("/account")) || under(href("/diary")),
  };
}

/** One tab: the icon over a small label on a phone; a row (icon, label) on the rail. The lit one draws its accent mark. */
function Tab({ to, label, icon, active, rail, avatar }: { to: string; label: string; icon?: IconType; active: boolean; rail: boolean; avatar?: ReactNode }) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  const Icon = icon;
  const color = active || hovered ? c.ink : c.muted;
  return (
    <Link href={to as Href} asChild>
      <Pressable
        role="link"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        {...bind}
        style={StyleSheet.flatten([
          rail
            ? { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, backgroundColor: active || hovered ? c.paper2 : "transparent" }
            : { flex: 1, minWidth: 0, minHeight: 48, alignItems: "center", justifyContent: "center", gap: space["2xs"] },
          web({ cursor: "pointer", transition: `color 150ms ${EASE}, background-color 150ms ${EASE}` }),
        ])}
      >
        {active ? (
          <View
            aria-hidden
            style={[
              { position: "absolute", backgroundColor: c.accent },
              rail ? { top: 0, bottom: 0, right: -(space.sm + hair), width: 2 } : { left: space.md, right: space.md, top: -(space.xs + hair), height: 2 },
              web({ animation: `${rail ? "pausa-mark-y" : "pausa-mark-x"} 220ms ${EASE} backwards` }),
            ]}
          />
        ) : null}
        {avatar ?? (Icon ? <Icon size={22} strokeWidth={STROKE} color={active ? c.accent : color} /> : null)}
        <Text numberOfLines={1} style={{ color, fontSize: rail ? 16 : 12, lineHeight: rail ? 24 : 16, paddingHorizontal: 2 }}>{label}</Text>
      </Pressable>
    </Link>
  );
}

/** "Registra": the one action of the app. A solid accent square with the + over its word on a phone; a full-width accent bar on the rail. */
function LogTab({ to, active, rail }: { to: string; active: boolean; rail: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { hovered, pressed, bind } = usePressed();
  const fill = hovered ? c.accentHover : c.accent;
  const press = web({ transition: `background-color 150ms ${EASE}, transform 150ms ${EASE}` });
  return (
    <Link href={to as Href} asChild>
      <Pressable
        role="link"
        aria-label={t("tabs.log")}
        aria-current={active ? "page" : undefined}
        {...bind}
        style={StyleSheet.flatten([
          rail
            ? { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, backgroundColor: fill, marginBottom: space.md, transform: [{ scale: pressed ? 0.98 : 1 }] }
            : { minWidth: 64, alignItems: "center", gap: space["2xs"], paddingHorizontal: space["2xs"] },
          rail ? press : null,
          web({ cursor: "pointer" }),
        ])}
      >
        {rail ? (
          <>
            <Plus size={22} strokeWidth={2} color={c.accentInk} />
            <Text variant="strong" style={{ color: c.accentInk }}>{t("tabs.log")}</Text>
          </>
        ) : (
          <>
            <View style={StyleSheet.flatten([{ width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: fill, transform: [{ scale: pressed ? 0.94 : 1 }] }, press])}>
              <Plus size={22} strokeWidth={2} color={c.accentInk} />
            </View>
            <Text variant="strong" style={{ fontSize: 12, lineHeight: 16 }}>{t("tabs.logShort")}</Text>
          </>
        )}
      </Pressable>
    </Link>
  );
}

function Logout() {
  const { c } = useTheme();
  const { t, href } = useI18n();
  const { signOut } = useSession();
  const router = useRouter();
  const [out, setOut] = useState(false);
  const { hovered, bind } = usePressed();
  return (
    <Pressable
      role="button"
      disabled={out}
      onPress={async () => {
        setOut(true);
        await signOut();
        router.replace(href() as never);
      }}
      {...bind}
      style={StyleSheet.flatten([{ minHeight: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, backgroundColor: hovered ? c.paper2 : "transparent" }, web({ cursor: "pointer", transition: "background-color 150ms, color 150ms" })])}
    >
      <Text variant="small" style={{ color: hovered ? c.ink : c.muted }}>{out ? t("account.loggingOut") : t("account.logout")}</Text>
    </Pressable>
  );
}

/** The tabs: a bar `1fr auto 1fr` on a phone (Diario, Serata | Registra | Cerchia, Profilo), a rail from 64rem. */
function TabBar({ circleId, rail }: { circleId: string; rail: boolean }) {
  const { c } = useTheme();
  const { t, href } = useI18n();
  const { state } = useSession();
  const insets = useSafeAreaInsets();
  const a = useActive(circleId);
  const base = `/c/${circleId}`;
  const me = state.status === "ready" ? state.me : null;
  const tab = (key: TabKey, to: string, active: boolean) => <Tab key={key} to={href(to)} label={t(`tabs.${key}`)} icon={ICONS[key]} active={active} rail={rail} />;
  const profile = (
    <Tab
      to={href("/me")}
      label={t("tabs.profile")}
      active={a.me}
      rail={rail}
      avatar={
        <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
          <Avatar name={me?.name ?? ""} image={me?.image} size={22} />
          {a.me ? <View aria-hidden style={{ position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 999, borderWidth: 2, borderColor: c.accent }} /> : null}
        </View>
      }
    />
  );
  const log = <LogTab to={href("/log")} active={a.log} rail={rail} />;

  if (rail)
    return (
      <View role="navigation" aria-label="Pausa" style={[{ width: 224, flexShrink: 0, borderRightWidth: hair, borderColor: c.rule, paddingHorizontal: space.sm, paddingTop: space.xl - 8 + insets.top, paddingBottom: space.lg, gap: space["2xs"] }, web({ height: "100dvh", position: "sticky", top: 0 })]}>
        <Link href={href(base) as Href} aria-label="Pausa" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm, marginBottom: space.lg }}>
          <Wordmark size={33.2} />
        </Link>
        {log}
        {tab("diary", base, a.diary)}
        {tab("serata", `${base}/serate`, a.serata)}
        {tab("ranking", `${base}/ranking`, a.ranking)}
        {tab("lists", `/lists?circle=${circleId}`, a.lists)}
        {tab("circle", `${base}/members`, a.circle)}
        {profile}
        <View style={{ marginTop: space["2xs"], borderTopWidth: hair, borderColor: c.rule, paddingTop: space.md }}>
          <Logout />
        </View>
      </View>
    );

  return (
    <View
      role="navigation"
      aria-label="Pausa"
      // Web: the page itself scrolls, so the bar is pinned to the bottom of the window. Its height is published as --pausa-bar
      // (sticky footers inside a screen sit on top of it) and reserved by a spacer of the same height at the end of the page.
      onLayout={Platform.OS === "web" ? (e) => setBarVar(e.nativeEvent.layout.height) : undefined}
      style={[
        { flexDirection: "row", alignItems: "center", columnGap: space["2xs"], borderTopWidth: hair, borderColor: c.rule, backgroundColor: c.paper, paddingHorizontal: space["2xs"], paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.xs) },
        web({ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200 }),
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
        {tab("diary", base, a.diary)}
        {tab("serata", `${base}/serate`, a.serata)}
      </View>
      {log}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
        {tab("circle", `${base}/members`, a.circle)}
        {profile}
      </View>
    </View>
  );
}

/** Web: the phone tab bar's height, for sticky footers (`bottom: var(--pausa-bar, 0px)`) and the spacer under the page. */
function setBarVar(h: number) {
  if (typeof document !== "undefined") document.documentElement.style.setProperty("--pausa-bar", `${Math.round(h)}px`);
}
function clearBarVar() {
  if (typeof document !== "undefined") document.documentElement.style.removeProperty("--pausa-bar");
}

/** The one bar at the top of every signed-in page: the mark (phones), the Cerchia I am in as a switch, the bell. */
function TopBar({ rail }: { rail: boolean }) {
  const { c } = useTheme();
  const { href } = useI18n();
  const { circle } = useCurrentCircle();
  const insets = useSafeAreaInsets();
  const menu = useSpaceMenu();
  return (
    <View
      role="banner"
      style={[
        { zIndex: 250, flexDirection: "row", alignItems: "center", gap: space["2xs"], height: 56 + insets.top, paddingTop: insets.top, paddingLeft: Math.max(space.xs, insets.left), paddingRight: Math.max(space["2xs"], insets.right), borderBottomWidth: hair, borderColor: c.rule, backgroundColor: c.paper },
        web({ position: "sticky", top: 0 }),
      ]}
    >
      {rail ? null : (
        <Link href={href(circle ? `/c/${circle.id}` : "/me/circles") as Href} aria-label="Pausa" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <PauseMark size={24} />
          </View>
        </Link>
      )}
      <View role="navigation" style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
        <SpaceButton open={menu.open} onPress={menu.toggle} />
      </View>
      {circle ? <Bell /> : null}
      {menu.open ? <SpacePanel close={menu.close} /> : null}
    </View>
  );
}

/**
 * The private shell. Native: fills the window and each screen scrolls inside. Web: the DOCUMENT scrolls, as in legacy (no
 * scrollbar of its own in the page column, sticky bars relative to the window); the top bar is sticky, the rail and the aside
 * are sticky full-height columns, the phone tab bar is fixed.
 */
const frame = (bg: string): ViewStyle[] => [{ backgroundColor: bg }, Platform.OS === "web" ? ({ minHeight: "100dvh" } as ViewStyle) : { flex: 1 }];

/** Web: a new page starts at the top (the document scroll survives a client-side navigation otherwise). */
function useScrollTopOnNavigate(path: string) {
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.scrollTo(0, 0);
  }, [path]);
}

/** Phones: top bar, page, tab bar. From 64rem: a centred 62rem frame, the rail on the left and a 40rem page column. */
export function Shell({ children }: { children: ReactNode }) {
  useDocumentTitle();
  const { c } = useTheme();
  const { href } = useI18n();
  const { state } = useSession();
  const { circleId } = useCurrentCircle();
  const { width } = useWindowDimensions();
  const path = usePathname();
  useScrollTopOnNavigate(path);
  const phoneBar = !!circleId && width < breakpoints.rail && state.status === "ready";
  useEffect(() => {
    if (!phoneBar) clearBarVar();
  }, [phoneBar]);
  // The sticky top bar's height, for scroll-padding-top (theme/index.tsx).
  const signedIn = state.status === "ready";
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (signedIn) document.documentElement.style.setProperty("--pausa-top", "56px");
    return () => void document.documentElement.style.removeProperty("--pausa-top");
  }, [signedIn]);
  // The bar is for signed-in screens; sign-in and the invite landing stand alone.
  const bare = state.status !== "ready" || path === href("/sign-in") || path.startsWith(href("/join/"));
  if (bare) return <View style={frame(c.paper)}><UpdateBanner />{children}</View>;

  if (width >= breakpoints.rail) {
    // v1: max-w 62rem with a 2rem gap; from 80rem, 82rem with a 2.5rem gap and the second column of a Cerchia.
    const wide = width >= breakpoints.aside;
    return (
      <View style={frame(c.paper)}>
        <View style={{ flex: 1, flexDirection: "row", alignSelf: "center", width: "100%", maxWidth: wide ? 1312 : 992, gap: wide ? 40 : 32 }}>
          {circleId ? <TabBar circleId={circleId} rail /> : null}
          <View style={{ flex: 1, maxWidth: 640 }}>
            <TopBar rail={!!circleId} />
            <UpdateBanner />
            <View style={{ flex: 1 }}>{children}</View>
          </View>
          {circleId && wide ? <CircleAside circleId={circleId} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={frame(c.paper)}>
      <TopBar rail={false} />
      <UpdateBanner />
      <View style={{ flex: 1 }}>{children}</View>
      {circleId ? <TabBar circleId={circleId} rail={false} /> : null}
      {circleId && Platform.OS === "web" ? <View aria-hidden style={web({ height: "var(--pausa-bar, 0px)", flexShrink: 0 })} /> : null}
    </View>
  );
}
