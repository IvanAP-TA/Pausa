import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import { control, useTheme, web, space } from "@/theme";
import { fonts, fontSize, fallbackSans } from "@/theme";
import type { Tone } from "./Text";

/** Ink text with a muted underline: the `.link` of the old app. Padded to 44pt tall so it is a real touch target. */
export function TextLink({ href, children, tone = "ink", label }: { href: string; children: ReactNode; tone?: Tone; label?: string }) {
  const { c } = useTheme();
  return (
    <Link
      href={href as Href}
      aria-label={label}
      // v1 `.link:hover`: the underline turns to the signal colour (global CSS on [data-link], web only).
      {...({ dataSet: { link: "1" } } as object)}
      style={[
        { color: c[tone], fontFamily: fonts.body400, fontSize: fontSize.md, lineHeight: 25, paddingVertical: space.sm, minWidth: control, textDecorationLine: "underline", textDecorationColor: c.muted },
        web({ fontFamily: `${fonts.body400}, ${fallbackSans}`, textUnderlineOffset: "0.2em", transition: "text-decoration-color 120ms cubic-bezier(0.16, 1, 0.3, 1)" }),
      ]}
    >
      {children}
    </Link>
  );
}
