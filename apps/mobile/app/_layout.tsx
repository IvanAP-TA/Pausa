import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { ThemeProvider, ThemeStyle, useTheme } from "@/theme";
import { useAppFonts } from "@/theme/fonts";

function Bar() {
  const { scheme } = useTheme();
  // Light icons on the dark ground and the other way round. Web has no status bar to style.
  return Platform.OS === "web" ? null : <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function Root() {
  const ready = useAppFonts();
  if (!ready) return null;
  // No app/+html.tsx on purpose: a custom one drops generateMetadata and the script tags from the static export (T0e).
  return (
    <ThemeProvider>
      <ThemeStyle />
      <Bar />
      <Slot />
    </ThemeProvider>
  );
}
