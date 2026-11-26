import { Pressable, View } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { Check } from "./lucide";
import { Text } from "./Text";

export type ChoiceOption<V extends string> = { value: V; label: string; testID?: string };

/** A row of mutually exclusive options (expiry, cover, theme, language): a radio group, 44pt each, the chosen one filled. */
export function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<ChoiceOption<V>>; onChange: (v: V) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space["2xs"] }}>
      <Text variant="label" tone="ink2" nativeID={`choice-${label}`}>
        {label}
      </Text>
      <View role="radiogroup" aria-label={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              role="radio"
              aria-checked={on}
              aria-label={o.label}
              onPress={() => onChange(o.value)}
              testID={o.testID}
              style={[
                {
                  minHeight: control,
                  minWidth: control,
                  paddingHorizontal: space.md,
                  flexDirection: "row",
                  gap: space["2xs"],
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: hair,
                  borderColor: on ? c.ink : c.rule,
                  backgroundColor: on ? c.paper3 : "transparent",
                },
                web({ cursor: "pointer" }),
              ]}
            >
              {on ? <Check size={16} strokeWidth={1.8} color={c.ink} /> : null}
              <Text variant={on ? "strong" : "body"} tone={on ? "ink" : "ink2"}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
