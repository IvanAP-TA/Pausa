import { Platform, Text as RNText, type StyleProp, type TextStyle } from "react-native";

/**
 * A decorative glyph inside a named control (an avatar's initial or emoji, a count badge). On web it is drawn by CSS
 * (`[data-glyph]::before`, globalCss) so it is not text of the control: axe's label-content-name-mismatch would otherwise
 * ask for it to be part of the control's name ("Profilo" next to a "G"). On native it is ordinary hidden text.
 */
export function Glyph({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  if (Platform.OS === "web") return <RNText aria-hidden {...({ dataSet: { glyph: children } } as object)} style={style} />;
  return (
    <RNText aria-hidden accessible={false} style={style}>
      {children}
    </RNText>
  );
}
