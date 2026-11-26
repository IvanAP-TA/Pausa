import Svg, { Path } from "react-native-svg";

// Google's own brand colours (design/tokens.css --color-google-*): fixed by Google's sign-in guidelines, so they do not follow the
// theme. The only colours in the app that are not a token.
const BLUE = "#4285F4";
const GREEN = "#34A853";
const YELLOW = "#FBBC05";
const RED = "#EA4335";

/** The Google "G" for the sign-in button. Decorative; takes the same props as a lucide icon (the colour is ignored). */
export function GoogleMark({ size = 18 }: { size?: number; strokeWidth?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path fill={BLUE} d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <Path fill={GREEN} d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z" />
      <Path fill={YELLOW} d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4-3.1z" />
      <Path fill={RED} d="M12 4.8c1.8 0 3.4.6 4.7 1.8l3.5-3.5A12 12 0 0 0 1.2 6.6l4 3.1c1-2.9 3.6-4.9 6.8-4.9z" />
    </Svg>
  );
}
