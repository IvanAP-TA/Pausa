import "@/features/diary/diary.messages";
import { useState } from "react";
import { Platform, View } from "react-native";
import { useI18n } from "@/i18n";
import { fonts, space, useTheme } from "@/theme";
import { Text } from "./Text";
import { starsText } from "./stars-text";
import { Minus as MinusIcon, Star as StarIcon } from "./lucide";

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

/** v1 RatingField geometry: a 22px "no rating" stop, then five 44px stars; every 22px is half a star. */
const STOP = 22;
const STAR = 44;
const WIDTH = STOP + STAR * 5;
const halvesAt = (x: number) => Math.max(0, Math.min(MAX_HALVES, Math.ceil((x - STOP) / (STAR / 2))));

/**
 * Picks a rating in half stars, as v1's RatingField: five 44px stars you slide across (a press on the left half of a star is a
 * half star, the stop before the first star is "no rating"), the number written beside them.
 * Web: a native range input laid invisibly over the stars stays the mechanism for pointer, touch and keyboard; under a mouse
 * the stars preview the value the pointer is on. Native: the finger drags across the row; assistive technology gets an
 * adjustable control with increment/decrement.
 */
export function StarInput({ value, onChange, label }: { value: number; onChange: (halves: number) => void; label: string }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const set = (n: number) => onChange(Math.max(0, Math.min(MAX_HALVES, n)));
  const shown = hover ?? value;
  const spoken = value ? t("feed.rating", { stars: starsText(value, locale) }) : t("log.noRating");
  const number = (r: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: r % 2 ? 1 : 0 }).format(r / 2);

  const stars = (
    <>
      <View aria-hidden pointerEvents="none" style={{ width: STOP, height: STAR, alignItems: "center", justifyContent: "center" }}>
        <MinusIcon size={14} color={c.muted} strokeWidth={1.6} />
      </View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} pointerEvents="none">
          <Star size={STAR} fill={shown >= i * 2 ? 1 : shown === i * 2 - 1 ? 0.5 : 0} />
        </View>
      ))}
    </>
  );

  const row =
    Platform.OS === "web" ? (
      <div
        className="pz-rating"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          setHover(halvesAt(e.clientX - e.currentTarget.getBoundingClientRect().left));
        }}
        onPointerLeave={() => setHover(null)}
        style={{ position: "relative", display: "flex", flexDirection: "row", alignItems: "center", width: WIDTH, height: STAR, flexShrink: 0 }}
      >
        {stars}
        <input
          type="range"
          className="pz-range"
          min={0}
          max={MAX_HALVES}
          step={1}
          value={value}
          aria-label={label}
          aria-valuenow={value}
          aria-valuetext={spoken}
          onChange={(e) => set(Number(e.currentTarget.value))}
        />
      </div>
    ) : (
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: MAX_HALVES, now: value, text: spoken }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => set(halvesAt(e.nativeEvent.locationX))}
        onResponderMove={(e) => set(halvesAt(e.nativeEvent.locationX))}
        style={{ flexDirection: "row", alignItems: "center", width: WIDTH, height: STAR }}
      >
        {stars}
      </View>
    );

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2">
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs }}>
        {row}
        <Text aria-hidden tone={shown ? "ink" : "muted"} style={{ minWidth: 72 }}>
          {shown ? (
            <>
              <Text style={{ fontFamily: fonts.display400, fontSize: 24 }}>{number(shown)}</Text>
              {" / 5"}
            </>
          ) : (
            t("log.noRating")
          )}
        </Text>
      </View>
      {/* the value, spoken once after a change (the stars and the number above are hidden from assistive technology) */}
      <Text aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
        {spoken}
      </Text>
    </View>
  );
}
