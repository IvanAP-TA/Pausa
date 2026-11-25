import type { ReactNode } from "react";
import { View } from "react-native";
import { hair, space, useTheme } from "@/theme";
import { Heading, Text } from "./Text";

/** A block on a private screen: a hairline above, an optional h2 and lede, then its content. */
export function Section({ title, lede, children, first }: { title?: string; lede?: string; children: ReactNode; first?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm, borderTopWidth: first ? 0 : hair, borderColor: c.rule, paddingTop: first ? 0 : space.lg }}>
      {title ? <Heading level={2}>{title}</Heading> : null}
      {lede ? <Text tone="ink2">{lede}</Text> : null}
      {children}
    </View>
  );
}
