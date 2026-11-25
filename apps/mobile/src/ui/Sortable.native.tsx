import type { ReactNode } from "react";
import { View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { control, hair, space, useTheme, web } from "@/theme";
import { clamp, Grip, MoveButton, SORT_ROW, type SortableLabels, type SortableProps } from "./sortable-shared";


/**
 * Android / iOS: the drag is Gesture Handler (a pan on the handle) with Reanimated for the rows that make room. (Web has its own file, with no
 * animation library: see Sortable.tsx.)
 * A list you reorder two ways: drag the handle (Gesture Handler pan, Reanimated for the rows that make room), or press the up and
 * down buttons, which are the accessible way (and work with a keyboard and a screen reader). Rows have one fixed height so a drop
 * position is a plain division. With reduced motion the rows jump instead of sliding.
 */
export type { SortableLabels };
export { SORT_ROW };

export function Sortable<T>({ items, keyOf, renderItem, onMove, labels, trailing, testID }: SortableProps<T>) {
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dy = useSharedValue(0);
  return (
    <GestureHandlerRootView testID={testID} role="list" style={{ height: items.length * SORT_ROW }}>
      {items.map((item, i) => (
        <SortRow key={keyOf(item)} index={i} count={items.length} active={active} target={target} dy={dy} onMove={onMove} item={item} labels={labels} trailing={trailing?.(item, i)}>
          {renderItem(item, i)}
        </SortRow>
      ))}
    </GestureHandlerRootView>
  );
}

function SortRow<T>({
  index, count, active, target, dy, onMove, item, labels, trailing, children,
}: {
  index: number;
  count: number;
  active: SharedValue<number>;
  target: SharedValue<number>;
  dy: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  item: T;
  labels: SortableLabels<T>;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: [-6, 6],
    onActivate: () => {
      active.value = index;
      target.value = index;
      dy.value = 0;
    },
    onUpdate: (e) => {
      dy.value = e.translationY;
      target.value = clamp(Math.round(index + e.translationY / SORT_ROW), 0, count - 1);
    },
    onDeactivate: () => {
      const to = target.value;
      active.value = -1;
      dy.value = 0;
      if (to !== index) onMove(index, to);
    },
    onFinalize: () => {
      if (active.value === index) {
        active.value = -1;
        dy.value = 0;
      }
    },
  });

  const style = useAnimatedStyle(() => {
    const a = active.value;
    const t = target.value;
    let y = 0;
    if (a === index) y = dy.value;
    else if (a >= 0) {
      if (a < t && index > a && index <= t) y = -SORT_ROW;
      else if (a > t && index < a && index >= t) y = SORT_ROW;
    }
    const moving = a === index;
    return { transform: [{ translateY: reduced || moving ? y : withTiming(y, { duration: 150 }) }], zIndex: moving ? 10 : 0 };
  });

  return (
    <Animated.View role="listitem" style={[{ position: "absolute", left: 0, right: 0, top: index * SORT_ROW, height: SORT_ROW, borderBottomWidth: hair, borderColor: c.rule, backgroundColor: c.paper, flexDirection: "row", alignItems: "center", gap: space.xs }, style]}>
      <GestureDetector gesture={pan}>
        <View aria-hidden importantForAccessibility="no" style={[{ width: control, height: control, alignItems: "center", justifyContent: "center" }, web({ cursor: "grab", touchAction: "none", userSelect: "none" })]}>
          <Grip color={c.muted} />
        </View>
      </GestureDetector>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0 }}>{children}</View>
      <MoveButton dir="up" disabled={index === 0} label={labels.up(item)} onPress={() => onMove(index, index - 1)} />
      <MoveButton dir="down" disabled={index === count - 1} label={labels.down(item)} onPress={() => onMove(index, index + 1)} />
      {trailing}
    </Animated.View>
  );
}

