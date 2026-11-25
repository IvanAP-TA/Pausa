import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { control, useTheme, web } from "@/theme";
import { Chevron } from "./Icons";

/** Everything the two Sortable implementations (web: Sortable.tsx, native: Sortable.native.tsx) have in common. No animation library here. */
export const SORT_ROW = 76;

export type SortableLabels<T> = { drag: (item: T) => string; up: (item: T) => string; down: (item: T) => string };

export type SortableProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** The content of a row (poster, title...); the handle and the move buttons are added around it. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Called once when a drag ends somewhere else, or a move button is pressed. */
  onMove: (from: number, to: number) => void;
  labels: SortableLabels<T>;
  /** Extra control at the end of each row (remove). */
  trailing?: (item: T, index: number) => ReactNode;
  testID?: string;
};

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Where a row sits while another is being dragged: the dragged one follows the finger, the ones it passes make room. */
export function shiftFor(index: number, from: number, target: number): number {
  if (from < 0) return 0;
  if (from < target && index > from && index <= target) return -SORT_ROW;
  if (from > target && index < from && index >= target) return SORT_ROW;
  return 0;
}

/** The up / down button: the accessible way to reorder (keyboard, screen reader), 44pt. */
export function MoveButton({ dir, disabled, label, onPress }: { dir: "up" | "down"; disabled: boolean; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      style={[{ width: control, height: control, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }, web({ cursor: disabled ? "default" : "pointer" })]}
    >
      <View style={{ transform: [{ rotate: dir === "up" ? "180deg" : "0deg" }] }}>
        <Chevron dir="down" color={c.ink} size={9} />
      </View>
    </Pressable>
  );
}

/** Six dots in two columns: the universal "drag here". */
export function Grip({ color }: { color: string }) {
  return (
    <View aria-hidden style={{ flexDirection: "row", gap: 3 }}>
      {[0, 1].map((col) => (
        <View key={col} style={{ gap: 3 }}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={{ width: 4, height: 4, backgroundColor: color }} />
          ))}
        </View>
      ))}
    </View>
  );
}
