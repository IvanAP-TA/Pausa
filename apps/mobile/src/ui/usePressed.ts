import { useState } from "react";

/**
 * Pressed state kept by hand. `Link asChild` merges the child's props with Radix Slot, which spreads `style` into an object:
 * an array or a function style (what `Pressable` normally takes) becomes `{0: ..}` and React DOM throws "Failed to set an
 * indexed property [0] on CSSStyleDeclaration". So pressables under a Link get ONE flattened style object and track `pressed` here.
 */
export function usePressed() {
  const [pressed, setPressed] = useState(false);
  return { pressed, handlers: { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) } };
}
