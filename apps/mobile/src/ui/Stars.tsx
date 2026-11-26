import "@/features/diary/diary.messages";
import { useState } from "react";
import { Platform, Pressable, View, type GestureResponderEvent } from "react-native";
import { useI18n } from "@/i18n";
import { control, fonts, space, useTheme } from "@/theme";
import { Button } from "./Button";
import { Text } from "./Text";
import { starsText } from "./stars-text";
import { Star as StarIcon } from "./lucide";

/** Ratings travel as half stars, 1..10 (the API's unit). 7 = three and a half stars. */
export const MAX_HALVES = 10;

/** v1 stars.tsx: a solid lucide star in rule, the signal colour laid over it up to the fill (half stars cut down the middle). */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const { c } = useTheme();
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <StarIcon size={size} fill={c.rule} color={c.rule} strokeWidth={0} />
      {fill > 0 ? (
        <View style={{ position: "absolute", left: 0, top: 0, width: size * fill, height: size, overflow: "hidden" }}>
          <StarIcon size={size} fill={c.accent} color={c.accent} strokeWidth={0} />
        </View>
      ) : null}
    </View>
  );
}

export { starsText } from "./stars-text";

/** A read-only rating: five stars with halves, and the number spoken once ("3,5 stelle su 5"). */
export function Stars({ halves, size = 16 }: { halves: number | null | undefined; size?: number }) {
  const { t, locale } = useI18n();
  if (!halves) return null;
  return (
    <View role="img" aria-label={t("feed.rating", { stars: starsText(halves, locale) })} style={{ flexDirection: "row", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={halves >= i * 2 ? 1 : halves === i * 2 - 1 ? 0.5 : 0} />
      ))}
    </View>
  );
}

/**
 * Picks a rating in half stars. One slider for assistive technology (arrow keys on the keyboard, increment/decrement actions on
 * native), 56pt stars you tap on the left or right half, and real 44pt "less / more / none" buttons for anyone who cannot aim at a half.
 */
export function StarInput({ value, onChange, label }: { value: number; onChange: (halves: number) => void; label: string }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const size = 44;
  const slot = 56;
  const set = (n: number) => onChange(Math.max(0, Math.min(MAX_HALVES, n)));
  const text = value ? t("feed.rating", { stars: starsText(value, locale) }) : t("log.noRating");
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2">
        {label}
      </Text>
      <View
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={MAX_HALVES}
        aria-valuenow={value}
        aria-valuetext={text}
        accessible
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
        // RN-web passes DOM keyboard events through; native ignores the prop.
        {...(Platform.OS === "web"
          ? ({
              tabIndex: 0,
              onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
                if (d) {
                  e.preventDefault();
                  set(value + d);
                } else if (e.key === "Home") set(0);
                else if (e.key === "End") set(MAX_HALVES);
              },
            } as object)
          : {})}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flexDirection: "row", alignSelf: "flex-start", outlineWidth: focused ? 2 : 0, outlineColor: c.focus, outlineStyle: "solid" } as never}
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const full = i * 2;
          const press = (half: boolean) => (_e: GestureResponderEvent) => set(value === (half ? full - 1 : full) ? 0 : half ? full - 1 : full);
          return (
            <View key={i} style={{ width: slot, height: slot, alignItems: "center", justifyContent: "center" }}>
              <Star size={size} fill={value >= full ? 1 : value === full - 1 ? 0.5 : 0} />
              <View aria-hidden style={{ position: "absolute", left: 0, top: 0, width: slot, height: slot, flexDirection: "row" }}>
                <Pressable accessible={false} focusable={false} tabIndex={-1} onPress={press(true)} style={{ flex: 1 }} testID={`star-${full - 1}`} />
                <Pressable accessible={false} focusable={false} tabIndex={-1} onPress={press(false)} style={{ flex: 1 }} testID={`star-${full}`} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Button label="−½" accessibilityLabel={`−½ ${t("diary.rating.less")}`} variant="quiet" disabled={value <= 0} onPress={() => set(value - 1)} style={{ paddingHorizontal: space.sm }} />
        <Button label="+½" accessibilityLabel={`+½ ${t("diary.rating.more")}`} variant="quiet" disabled={value >= MAX_HALVES} onPress={() => set(value + 1)} style={{ paddingHorizontal: space.sm }} />
        <Text variant="strong" tone={value ? "ink" : "muted"} style={{ minHeight: control, textAlignVertical: "center", paddingVertical: space.xs, flexShrink: 1 }} aria-live="polite">
          {text}
        </Text>
        {value ? <Button label={t("diary.rating.clear")} variant="quiet" onPress={() => set(0)} /> : null}
      </View>
    </View>
  );
}
