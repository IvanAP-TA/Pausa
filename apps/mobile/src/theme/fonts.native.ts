// Android / iOS: the same families as the web, from @expo-google-fonts (SIL Open Font License), one registered name per
// weight because Android cannot pick a weight inside one family.
import { useFonts } from "expo-font";
import { fonts } from "./tokens";

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [fonts.display200]: require("@expo-google-fonts/sofia-sans-extra-condensed/200ExtraLight/SofiaSansExtraCondensed_200ExtraLight.ttf"),
    [fonts.display400]: require("@expo-google-fonts/sofia-sans-extra-condensed/400Regular/SofiaSansExtraCondensed_400Regular.ttf"),
    [fonts.body300]: require("@expo-google-fonts/barlow/300Light/Barlow_300Light.ttf"),
    [fonts.body400]: require("@expo-google-fonts/barlow/400Regular/Barlow_400Regular.ttf"),
    [fonts.body600]: require("@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf"),
  });
  // On a font error the system font is better than a blank screen.
  return loaded || error !== null;
}
