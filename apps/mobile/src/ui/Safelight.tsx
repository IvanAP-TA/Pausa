import { Platform, View } from "react-native";
import { web } from "@/theme";

/**
 * The safelight and the house curtain (DESIGN.md Surfaces), ported from v1's `.projector::before`: one soft light of the
 * signal colour falling on the top of the screen, on vertical velvet folds that fade out before the content. It lies on the
 * ground, behind everything. Strengths come from `--safelight` and `--curtain` (globalCss), so they follow the theme.
 * Web only: native has no CSS gradients without a new dependency.
 */
export function Safelight() {
  if (Platform.OS !== "web") return null;
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={web({
        position: "absolute",
        zIndex: 0,
        top: 0,
        left: "50%",
        width: "min(100vw, 72rem)",
        height: "30rem",
        transform: "translateX(-50%)",
        backgroundImage:
          "radial-gradient(ellipse 62% 100% at 50% 0%, color-mix(in oklab, var(--c-accent) var(--safelight), transparent), transparent 72%), " +
          "repeating-linear-gradient(to right, transparent 0 14px, color-mix(in oklab, black var(--curtain), transparent) 30px, transparent 46px)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0 35%, transparent 92%)",
        maskImage: "linear-gradient(to bottom, black 0 35%, transparent 92%)",
      })}
    />
  );
}
