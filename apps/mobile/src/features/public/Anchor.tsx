import type { ReactNode } from "react";
import { Platform, Text as RNText } from "react-native";
import { control, space, web } from "@/theme";

type AnchorProps = {
  href: string;
  children: ReactNode;
  label?: string;
  /** Pad to the 44pt touch target (a text-only link is otherwise ~20pt tall). */
  pad?: boolean;
  lang?: string;
  current?: boolean;
};

/**
 * A real `<a href>` in the static HTML (react-native-web renders `href` on Text as an anchor), so links work with no
 * JavaScript. Public pages link with full page loads, which is exactly what a crawler and a zero-JS visitor get.
 */
export function Anchor({ href, children, label, pad, lang, current }: AnchorProps) {
  const extra = Platform.OS === "web" ? ({ href, lang, "aria-current": current ? "page" : undefined } as object) : {};
  return (
    <RNText
      {...extra}
      role="link"
      aria-label={label}
      onPress={undefined}
      style={[pad ? { minHeight: control, minWidth: control, paddingHorizontal: space["2xs"], paddingVertical: space.xs } : null, web({ display: "inline-flex", alignItems: "center", textDecorationLine: "none", color: "inherit" })]}
    >
      {children}
    </RNText>
  );
}
