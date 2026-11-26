import { useId } from "react";
import { View } from "react-native";
import { control, cssVar, fallbackSans, fonts, space } from "@/theme";
import type { ChoiceOption } from "./Choice";
import { Text } from "./Text";

/**
 * v1 `<select class="field">` under a `.field-label` (web): the browser's own list, 1px muted edge, square, 44px, the focus ring
 * on the edge. Native has no select: Select.native.tsx shows the same options as a Choice row.
 */
export function Select<V extends string>({ label, value, options, onChange, testID }: { label: string; value: V; options: Array<ChoiceOption<V>>; onChange: (v: V) => void; testID?: string }) {
  const id = useId();
  return (
    <View style={{ gap: space["2xs"], flex: 1, minWidth: 0 }}>
      <label htmlFor={id} style={{ display: "contents" }}>
        <Text variant="label" tone="ink2">
          {label}
        </Text>
      </label>
      <select
        id={id}
        aria-label={label}
        data-testid={testID}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        style={{
          boxSizing: "border-box",
          minHeight: control,
          minWidth: 0,
          width: "100%",
          padding: `0 ${space.sm}px`,
          border: `1px solid var(${cssVar("muted")})`,
          borderRadius: 0,
          background: `var(${cssVar("paper")})`,
          color: `var(${cssVar("ink")})`,
          fontFamily: `${fonts.body400}, ${fallbackSans}`,
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </View>
  );
}
