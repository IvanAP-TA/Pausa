// Two-column plate of the guides and legal pages: the subhead in the margin, the text at a reading measure beside it. No media
// query and no script: both columns are flex items that wrap under each other when the row is narrower than ~42rem.
import type { ReactNode } from "react";
import { View } from "react-native";
import { hair, space, useTheme, web } from "@/theme";
import { Heading } from "@/ui/Text";

export function Plate({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg, gap: space.sm },
        web({ flexDirection: "row", flexWrap: "wrap", columnGap: 48, rowGap: 16 }),
      ]}
    >
      <View style={web({ flex: "1 1 18rem", maxWidth: "20rem", minWidth: 0 })}>
        <Heading level={2}>{title}</Heading>
      </View>
      <View style={[{ gap: space.sm, maxWidth: 680 }, web({ flex: "999 1 24rem", minWidth: 0 })]}>{children}</View>
    </View>
  );
}
