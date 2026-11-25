import { Platform, Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fallbackSans, fontSize, fonts, useTheme, web, type ColorName } from "@/theme";

export type Tone = Extract<ColorName, "ink" | "ink2" | "muted" | "accent" | "error" | "success" | "accentInk">;

type Variant = "body" | "lead" | "small" | "strong" | "label";
const VARIANTS: Record<Variant, TextStyle> = {
  body: { fontFamily: fonts.body400, fontSize: fontSize.md, lineHeight: 25 },
  lead: { fontFamily: fonts.body300, fontSize: fontSize.lead, lineHeight: 28 },
  small: { fontFamily: fonts.body400, fontSize: fontSize.sm, lineHeight: 21 },
  strong: { fontFamily: fonts.body600, fontSize: fontSize.md, lineHeight: 25 },
  label: { fontFamily: fonts.body400, fontSize: fontSize.sm, lineHeight: 21 },
};

export type AppTextProps = TextProps & { variant?: Variant; tone?: Tone };

/** Body text: Barlow, sentence case. No fixed heights anywhere, so Dynamic Type / browser zoom can grow it. */
export function Text({ variant = "body", tone = "ink", style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  return <RNText {...rest} style={[VARIANTS[variant], { color: c[tone] }, web({ fontFamily: `${VARIANTS[variant].fontFamily}, ${fallbackSans}` }), style]} />;
}

type Level = 1 | 2 | 3;
// DESIGN.md: display is Sofia Sans Extra Condensed in capitals, 200 on page heads (h1, h2), 400 on item titles (h3); line-height 1.05+.
const HEADING: Record<Level, { fontFamily: string; size: number; webSize: string }> = {
  1: { fontFamily: fonts.display200, size: fontSize.display, webSize: "clamp(3.75rem, 3.3rem + 1.9vw, 4.5rem)" },
  2: { fontFamily: fonts.display200, size: fontSize.section, webSize: "2rem" },
  3: { fontFamily: fonts.display400, size: fontSize.title, webSize: "2rem" },
};

export type HeadingProps = TextProps & { level?: Level; tone?: Tone; /** Public pages: fluid hero size. */ hero?: boolean };

export function Heading({ level = 2, tone = "ink", hero, style, ...rest }: HeadingProps) {
  const { c } = useTheme();
  const h = HEADING[level];
  const size = hero ? 64 : h.size;
  return (
    <RNText
      {...rest}
      role="heading"
      aria-level={level}
      // Large display type: grows with the system setting, but not so far that a 60dp heading leaves the screen.
      maxFontSizeMultiplier={1.3}
      style={[
        { fontFamily: h.fontFamily, fontSize: size, lineHeight: Math.round(size * 1.08), color: c[tone], textTransform: "uppercase", fontWeight: "normal" },
        web({ fontFamily: `${h.fontFamily}, ${fallbackSans}`, fontSize: hero ? "clamp(4rem, 13vw, 8rem)" : h.webSize, letterSpacing: "-0.005em", textWrap: "balance", fontSynthesis: "none" }),
        style,
      ]}
    />
  );
}

/** Small display capitals for controls and section titles inside a screen (Sofia 400). */
export function Title({ tone = "ink", style, ...rest }: TextProps & { tone?: Tone }) {
  const { c } = useTheme();
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={1.4}
      style={[
        { fontFamily: fonts.display400, fontSize: fontSize.xl, lineHeight: 28, color: c[tone], textTransform: "uppercase", fontWeight: "normal" },
        web({ fontFamily: `${fonts.display400}, ${fallbackSans}`, fontSynthesis: "none" }),
        style,
      ]}
    />
  );
}

export const isWeb = Platform.OS === "web";
