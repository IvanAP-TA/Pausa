import { useRef, useState, type ReactNode } from "react";
import { PanResponder, View } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { clamp, Grip, MoveButton, shiftFor, SORT_ROW, type SortableProps } from "./sortable-shared";

export type { SortableLabels } from "./sortable-shared";
export { SORT_ROW };

/**
 * Web (and anything that is not Android / iOS): a list you reorder two ways. Drag the handle (React Native's PanResponder, which
 * the browser drives with mouse and touch), or press the up and down buttons, the accessible way (keyboard, screen reader). Rows
 * have one fixed height so a drop position is a plain division. The rows make room by jumping, never sliding: nothing to reduce for
 * `prefers-reduced-motion`. It uses no animation library on purpose (they are not in the shell's JavaScript budget, BUDGET.md D8).
 * Android and iOS have their own file with Gesture Handler and Reanimated (Sortable.native.tsx).
 */
export function Sortable<T>({ items, keyOf, renderItem, onMove, labels, trailing, testID }: SortableProps<T>) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const target = drag ? clamp(Math.round(drag.from + drag.dy / SORT_ROW), 0, items.length - 1) : -1;
  return (
    <View testID={testID} role="list" style={{ height: items.length * SORT_ROW }}>
      {items.map((item, i) => (
        <SortRow key={keyOf(item)} index={i} count={items.length} drag={drag} target={target} setDrag={setDrag} onMove={onMove} item={item} labels={labels} trailing={trailing?.(item, i)}>
          {renderItem(item, i)}
        </SortRow>
      ))}
    </View>
  );
}

function SortRow<T>({
  index, count, drag, target, setDrag, onMove, item, labels, trailing, children,
}: {
  index: number;
  count: number;
  drag: { from: number; dy: number } | null;
  target: number;
  setDrag: (d: { from: number; dy: number } | null) => void;
  onMove: (from: number, to: number) => void;
  item: T;
  labels: SortableProps<T>["labels"];
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { c } = useTheme();
  // The responder is made once, so it reads the latest props through a ref.
  const latest = useRef({ index, count, onMove, setDrag });
  latest.current = { index, count, onMove, setDrag };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // the page's scroll must not take the drag away
      onPanResponderGrant: () => latest.current.setDrag({ from: latest.current.index, dy: 0 }),
      onPanResponderMove: (_e, g) => latest.current.setDrag({ from: latest.current.index, dy: g.dy }),
      onPanResponderRelease: (_e, g) => {
        const { index: from, count: n, onMove: move, setDrag: set } = latest.current;
        const to = clamp(Math.round(from + g.dy / SORT_ROW), 0, n - 1);
        set(null);
        if (to !== from) move(from, to);
      },
      onPanResponderTerminate: () => latest.current.setDrag(null),
    }),
  ).current;

  const moving = drag?.from === index;
  const y = moving ? clamp(drag!.dy, -index * SORT_ROW, (count - 1 - index) * SORT_ROW) : drag ? shiftFor(index, drag.from, target) : 0;
  return (
    <View
      role="listitem"
      style={{ position: "absolute", left: 0, right: 0, top: index * SORT_ROW, height: SORT_ROW, borderBottomWidth: hair, borderColor: c.rule, backgroundColor: moving ? c.paper2 : c.paper, flexDirection: "row", alignItems: "center", gap: space.xs, transform: [{ translateY: y }], zIndex: moving ? 10 : 0 }}
    >
      <View
        {...pan.panHandlers}
        aria-hidden
        importantForAccessibility="no"
        testID={`drag-${index}`}
        style={[{ width: control, height: control, alignItems: "center", justifyContent: "center" }, web({ cursor: "grab", touchAction: "none", userSelect: "none" })]}
      >
        <Grip color={c.muted} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0 }}>{children}</View>
      <MoveButton dir="up" disabled={index === 0} label={labels.up(item)} onPress={() => onMove(index, index - 1)} />
      <MoveButton dir="down" disabled={index === count - 1} label={labels.down(item)} onPress={() => onMove(index, index + 1)} />
      {trailing}
    </View>
  );
}
