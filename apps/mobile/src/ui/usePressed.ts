import { useState } from "react";

/**
 * Pressed (and, on web, hovered) state kept by hand. `Link asChild` merges the child's props with Radix Slot, which spreads `style` into an object:
 * an array or a function style (what `Pressable` normally takes) becomes `{0: ..}` and React DOM throws "Failed to set an
 * indexed property [0] on CSSStyleDeclaration". So pressables under a Link get ONE flattened style object and track `pressed` here.
 * `handlers` is press only (unchanged callers); `bind` adds the hover handlers (v1's `:hover` states: a paper-2 ground, ink text).
 */
export function usePressed() {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const handlers = { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) };
  return { pressed, hovered, handlers, bind: { ...handlers, onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } };
}
