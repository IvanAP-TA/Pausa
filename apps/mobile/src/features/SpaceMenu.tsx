import { Link, usePathname, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useI18n } from "@/i18n";
import { hair, space, useTheme, web } from "@/theme";
import { Check, ChevronDown, Plus, STROKE, Users } from "@/ui/lucide";
import { Text } from "@/ui/Text";
import { usePressed } from "@/ui/usePressed";
import { useCurrentCircle } from "./current-circle";
import { useSession } from "./session";

function MenuRow({ to, label, current, icon, onGo }: { to: string; label: string; current?: boolean; icon: "users" | "plus"; onGo: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { hovered, bind } = usePressed();
  const color = current || hovered ? c.ink : c.ink2;
  const Icon = icon === "users" ? Users : Plus;
  return (
    <Link href={to as Href} asChild>
      <Pressable
        role="link"
        aria-current={current ? "page" : undefined}
        onPress={onGo}
        {...bind}
        style={StyleSheet.flatten([
          { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, borderTopWidth: hair, borderColor: c.rule, backgroundColor: hovered ? c.paper2 : "transparent" },
          web({ cursor: "pointer", transition: "background-color 120ms cubic-bezier(0.16, 1, 0.3, 1)" }),
        ])}
      >
        <Icon size={18} strokeWidth={STROKE} color={color} />
        <Text variant={current ? "strong" : "body"} numberOfLines={1} style={{ flex: 1, color }}>{label}</Text>
        {current ? <Check size={18} strokeWidth={1.8} color={c.accent} aria-label={t("space.here")} /> : null}
      </Pressable>
    </Link>
  );
}

/** Open/closed state of the Cerchia switch. It closes on Escape and when the page changes. */
export function useSpaceMenu() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return { open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}

/**
 * v1 space-menu.tsx. Which Cerchia am I in, and where else can I go: its name is the button. A disclosure (this button and
 * the list of links it opens, `SpacePanel`), not a menu widget.
 */
export function SpaceButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { circle } = useCurrentCircle();
  const { hovered, bind } = usePressed();
  const name = circle ? circle.name : t("space.circles");
  return (
    <Pressable
      role="button"
      aria-expanded={open}
      aria-label={`${name}: ${t("space.switchOpen")}`}
      onPress={onPress}
      {...bind}
      style={StyleSheet.flatten([
        { minHeight: 44, minWidth: 0, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, backgroundColor: open || hovered ? c.paper2 : "transparent" },
        web({ cursor: "pointer", transition: "background-color 120ms cubic-bezier(0.16, 1, 0.3, 1)" }),
      ])}
    >
      <Users size={18} strokeWidth={STROKE} color={c.muted} />
      <Text variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Text>
      <View style={[{ transform: [{ rotate: open ? "180deg" : "0deg" }] }, web({ transition: "transform 200ms ease-out" })]}>
        <ChevronDown size={18} strokeWidth={1.8} color={c.muted} />
      </View>
    </Pressable>
  );
}

/** The list under the bar: every Cerchia (the current one checked) and the page to join or create another. Full width of the bar. */
export function SpacePanel({ close }: { close: () => void }) {
  const { c } = useTheme();
  const { t, href } = useI18n();
  const { state } = useSession();
  const { circle } = useCurrentCircle();
  const circles = state.status === "ready" ? state.me.circles : [];
  return (
    <>
      {/* A tap anywhere outside the list closes it. */}
      <Pressable aria-hidden accessible={false} onPress={close} style={[{ position: "absolute", top: "100%", left: 0, right: 0, height: 4000, zIndex: 290 }, web({ position: "fixed", top: 0, bottom: 0, height: "auto", cursor: "default" })]} />
      <View
        style={[
          { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300, backgroundColor: c.paper, borderBottomWidth: hair, borderColor: c.rule },
          web({ boxShadow: `0 24px 48px -24px ${c.scrim}`, animation: "pausa-unfold 220ms cubic-bezier(0.16, 1, 0.3, 1) backwards" }),
        ]}
      >
        <Text variant="small" tone="muted" style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space["2xs"] }}>{t("space.switchTitle")}</Text>
        <ScrollView style={[{ maxHeight: 448 }, web({ maxHeight: "min(70dvh, 28rem)", overscrollBehavior: "contain" })]}>
          {circles.map((x) => (
            <MenuRow key={x.id} to={href(`/c/${x.id}`)} label={x.name} current={x.id === circle?.id} icon="users" onGo={close} />
          ))}
          <View style={{ borderBottomWidth: hair, borderColor: c.rule }}>
            <MenuRow to={href("/me/circles")} label={t("space.moreCircles")} icon="plus" onGo={close} />
          </View>
        </ScrollView>
      </View>
    </>
  );
}
