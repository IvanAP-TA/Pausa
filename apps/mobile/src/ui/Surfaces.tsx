import type { ReactNode } from "react";
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { fallbackSans, fonts, hair, space, useTheme, web } from "@/theme";
import { Grain } from "./Grain";
import { Check } from "./lucide";
import { Text } from "./Text";

// The surfaces of v1 globals.css (.well .grained .reel .day .chapter .empty .meter, the checkbox), ported one for one.
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// v1's speck grain: an SVG noise tile, white specks, at --grain opacity (inverted on light paper by the global CSS).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 9 -4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\") 0 0 / 200px 200px";

/** `.well` (one step up, paper-2), `grained` adds the speck grain: on a well that carries no picture, two a screen at most. */
export function Well({ grained, children, style }: { grained?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.paper2 }, grained ? web({ isolation: "isolate" }) : null, style]}>
      {grained && Platform.OS === "web" ? (
        <View aria-hidden pointerEvents="none" {...({ dataSet: { grain: "1" } } as object)} style={web({ position: "absolute", inset: 0, zIndex: -1, opacity: "var(--grain)", background: GRAIN })} />
      ) : null}
      {grained && Platform.OS !== "web" ? <Grain /> : null}
      {children}
    </View>
  );
}

/** `.reel`: a frame of film, two rows of sprocket holes cut in paper colour across the top and the bottom. */
export function Reel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const holes = (edge: "top" | "bottom") =>
    Platform.OS === "web" ? (
      <View
        aria-hidden
        pointerEvents="none"
        style={[{ position: "absolute", left: 0, right: 0, height: 8, [edge]: 7 }, web({ background: `repeating-linear-gradient(to right, transparent 0 8px, ${c.paper} 8px 18px, transparent 18px 22px)` })]}
      />
    ) : (
      <View aria-hidden pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: 8, [edge]: 7, flexDirection: "row", overflow: "hidden" }}>
        {Array.from({ length: 60 }, (_, i) => (
          <View key={i} style={{ width: 10, height: 8, marginLeft: i === 0 ? 8 : 12, backgroundColor: c.paper }} />
        ))}
      </View>
    );
  return (
    <View style={[{ backgroundColor: c.paper2 }, style]}>
      {children}
      {holes("top")}
      {holes("bottom")}
    </View>
  );
}

/** The 1px ink rule over a day or a chapter (the only ink rules of the app), drawn from the left once when the page arrives. */
function InkRule() {
  const { c } = useTheme();
  return (
    <View
      aria-hidden
      style={[{ position: "absolute", left: 0, right: 0, top: -hair, height: hair, backgroundColor: c.ink }, web({ transformOrigin: "left", animation: `pausa-draw 420ms ${EASE} 120ms backwards` })]}
    />
  );
}

/** `.day`: a day of the diary. The date as a 4.5rem figure on an ink rule, the weekday (or today, yesterday) and the month beside it. Today's figure takes the signal. */
export function DayHead({ day, name, month, today }: { day: number; name: string; month: string; today?: boolean }) {
  const { c } = useTheme();
  return (
    <View role="heading" aria-level={2} style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: hair, borderColor: "transparent" }}>
      <InkRule />
      <Text
        style={[
          { fontFamily: fonts.display200, fontSize: 72, lineHeight: 59, color: today ? c.accent : c.ink },
          web({ fontFamily: `${fonts.display200}, ${fallbackSans}`, fontVariantNumeric: "lining-nums proportional-nums", fontSynthesis: "none" }),
        ]}
      >
        {day}
      </Text>
      <View>
        <Text variant="strong" style={web({ textTransform: "none" })}>{name.charAt(0).toUpperCase() + name.slice(1)}</Text>
        <Text variant="small" tone="muted">{month}</Text>
      </View>
    </View>
  );
}

/** `.chapter`: a top-level section of a page, thin capitals at 2.5rem under the same ink rule. */
export function Chapter({ children, id }: { children: ReactNode; id?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingTop: space.sm, borderTopWidth: hair, borderColor: "transparent" }}>
      <InkRule />
      <Text
        role="heading"
        aria-level={2}
        nativeID={id}
        style={[
          { fontFamily: fonts.display200, fontSize: 40, lineHeight: 40, color: c.ink, textTransform: "uppercase" },
          web({ fontFamily: `${fonts.display200}, ${fallbackSans}`, letterSpacing: "-0.005em", fontSynthesis: "none" }),
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

/** `.empty::before`: the pause mark's two bars standing up above the line that says nothing is here yet. */
export function EmptyMark() {
  const { c } = useTheme();
  return (
    <View aria-hidden style={[{ width: 20, height: 28, flexDirection: "row", justifyContent: "space-between" }, web({ transformOrigin: "bottom", animation: `pausa-stand 420ms ${EASE} 120ms backwards` })]}>
      <View style={{ width: 7, backgroundColor: c.accent }} />
      <View style={{ width: 7, backgroundColor: c.accent }} />
    </View>
  );
}

/** `.meter`: a 2px track, the fill in the signal colour, drawn from the left. `value` is 0..1. Decorative, as in v1 (aria-hidden):
 *  the figure it draws is always written beside it ("2 di 3", "4,5"), and `progressbar` is the app's "still loading" signal. */
export function Meter({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View aria-hidden style={[{ height: 2, backgroundColor: c.rule, overflow: "hidden" }, style]}>
      <View style={[{ height: "100%", width: `${v * 100}%`, backgroundColor: c.accent }, web({ transformOrigin: "left", animation: `pausa-draw 420ms ${EASE} 160ms backwards` })]} />
    </View>
  );
}

/** v1's one checkbox: a 20px hairline cell on the ground, filled with the signal and ticked when chosen. */
export function CheckBox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={12}
      style={[
        { width: 20, height: 20, borderWidth: hair, borderColor: checked ? c.accent : c.muted, backgroundColor: checked ? c.accent : c.paper, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 },
        web({ cursor: disabled ? "not-allowed" : "pointer" }),
      ]}
    >
      {checked ? <Check size={14} strokeWidth={2.4} color={c.accentInk} /> : null}
    </Pressable>
  );
}
