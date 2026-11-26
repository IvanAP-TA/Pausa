import { Pressable, View } from "react-native";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "./Avatar";
import { Check } from "./lucide";
import { Text } from "./Text";
import { usePressed } from "./usePressed";

/**
 * v1 PersonChip: a person to pick, portrait and name on a 44px chip. `radio` for one of a group ("Visto da"), `checkbox` for
 * any number. Chosen is a filled chip with the ink edge and an accent tick, never colour alone. Leave `person` out for a choice
 * that is not a person ("Tutti").
 */
export function PersonChip({
  label,
  person,
  on,
  onPress,
  type = "radio",
  testID,
}: {
  label: string;
  person?: { name: string; image: string | null };
  on: boolean;
  onPress: () => void;
  type?: "radio" | "checkbox";
  testID?: string;
}) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  return (
    <Pressable
      role={type}
      aria-checked={on}
      aria-label={label}
      onPress={onPress}
      testID={testID}
      {...bind}
      style={[
        {
          minHeight: control,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingVertical: space["2xs"],
          paddingLeft: 6,
          paddingRight: space.sm,
          borderWidth: hair,
          borderColor: on ? c.ink : hovered ? c.muted : c.rule,
          backgroundColor: on ? c.paper3 : "transparent",
        },
        web({ cursor: "pointer", userSelect: "none", transition: "border-color 150ms, background-color 150ms" }),
      ]}
    >
      {person ? <Avatar name={person.name} image={person.image} size={28} /> : <View style={{ width: 4 }} />}
      <Text tone={on ? "ink" : "ink2"} numberOfLines={1} style={{ maxWidth: 192 }}>
        {label}
      </Text>
      {on ? <Check size={16} strokeWidth={2} color={c.accent} /> : null}
    </Pressable>
  );
}
