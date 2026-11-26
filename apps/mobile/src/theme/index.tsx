import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, Platform, type TextStyle, type ViewStyle } from "react-native";
import { readStored, writeStored } from "./pref-storage";
import { colorNames, cssRef, cssVar, fonts, palettes, type Palette, type Scheme } from "./tokens";

export * from "./tokens";

export type ThemePref = "system" | "light" | "dark";
const STORAGE_KEY = "pausa-theme";
const isWeb = Platform.OS === "web";

/** On web every colour is a CSS variable, so the theme can change (or be set by data-theme) without re-rendering anything. */
const webPalette = Object.fromEntries(colorNames.map((n) => [n, cssRef(n)])) as Palette;

type ThemeValue = { c: Palette; scheme: Scheme; pref: ThemePref; setPref: (p: ThemePref) => void };
const ThemeCtx = createContext<ThemeValue>({ c: isWeb ? webPalette : palettes.dark, scheme: "dark", pref: "dark", setPref: () => undefined });

async function readPref(): Promise<ThemePref | null> {
  const v = await readStored(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : null;
}
const writePref = (p: ThemePref) => writeStored(STORAGE_KEY, p);

/** Dark by default (DESIGN.md: "dark with no cookie"); the person can pick light or follow the device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>("dark");
  const [device, setDevice] = useState<Scheme>(() => (Appearance.getColorScheme() === "light" ? "light" : "dark"));

  useEffect(() => {
    readPref().then((p) => p && setPrefState(p));
    const sub = Appearance.addChangeListener(({ colorScheme }) => setDevice(colorScheme === "light" ? "light" : "dark"));
    return () => sub.remove();
  }, []);


  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    void writePref(p);
  }, []);

  const scheme: Scheme = pref === "system" ? device : pref;

  useEffect(() => {
    if (!isWeb) return;
    document.documentElement.dataset.theme = pref;
    // The browser bar follows the theme in use (GAPS M12): the static pages carry the dark petrol, the shell corrects it here.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palettes[scheme].paper);
  }, [pref, scheme]);
  const value = useMemo<ThemeValue>(() => ({ c: isWeb ? webPalette : palettes[scheme], scheme, pref, setPref }), [scheme, pref, setPref]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

/** Style props that only exist on web (CSS strings, cursor, ...): ignored on native, typed loosely on purpose. */
export const web = (style: Record<string, unknown>): ViewStyle & TextStyle => (isWeb ? (style as ViewStyle & TextStyle) : {});

function block(p: Palette, scheme: Scheme) {
  return `${colorNames.map((n) => `${cssVar(n)}:${p[n]}`).join(";")};color-scheme:${scheme}`;
}

/**
 * The global CSS of the web build, one `<style>` in the root layout, so it is in the static HTML (no JavaScript needed to
 * look right): theme variables (dark default, `data-theme="light"`, or the device when `data-theme="system"`), the
 * @font-face rules for the self-hosted woff2 files, focus ring, reduced motion and the page frame.
 */
export function globalCss(): string {
  const face = (family: string, file: string, weight: number) =>
    `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(/fonts/${file}.woff2) format("woff2")}`;
  return [
    `:root{${block(palettes.dark, "dark")}}`,
    `:root[data-theme="light"]{${block(palettes.light, "light")}}`,
    `@media (prefers-color-scheme: light){:root[data-theme="system"]{${block(palettes.light, "light")}}}`,
    // Safelight and curtain strengths (v1 tokens.css): dark, stronger on a phone (small, dimmed screens), faint on light paper.
    `:root{--safelight:14%;--curtain:30%;--grain:.07}`,
    `@media (max-width:40rem){:root:not([data-theme="light"]){--safelight:18%;--curtain:46%;--grain:.12}}`,
    `:root[data-theme="light"]{--safelight:7%;--curtain:5%;--grain:.12}`,
    `@media (prefers-color-scheme: light){:root[data-theme="system"]{--safelight:7%;--curtain:5%;--grain:.12}}`,
    // The grain's specks are white on dark paper, dark on light paper.
    `:root[data-theme="light"] [data-grain]{filter:invert(1)}`,
    `@media (prefers-color-scheme: light){:root[data-theme="system"] [data-grain]{filter:invert(1)}}`,
    face(fonts.display200, "sofia-sans-extra-condensed-latin-200-normal", 200),
    face(fonts.display400, "sofia-sans-extra-condensed-latin-400-normal", 400),
    face(fonts.body300, "barlow-latin-300-normal", 300),
    face(fonts.body400, "barlow-latin-400-normal", 400),
    face(fonts.body600, "barlow-latin-600-normal", 600),
    `html,body{margin:0;padding:0;background:var(--c-paper);color:var(--c-ink);-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-tap-highlight-color:transparent}`,
    // Expo's reset pins html/body/#root to 100% and hides body overflow (an app that scrolls inside ScrollViews). Public pages are
    // documents that scroll as a whole, so undo it here; the private shell bounds its own height (Shell.tsx).
    `html,body,#root{height:auto;min-height:100%}`,
    `body{overflow:auto;overflow-x:clip;-webkit-font-smoothing:antialiased}`,
    `#root{display:flex;flex-direction:column;min-height:100vh;min-height:100dvh}`,
    `a{color:inherit;text-decoration:none}`,
    `:focus-visible{outline:2px solid var(--c-focus);outline-offset:2px}`,
    `::selection{background:color-mix(in oklab,var(--c-accent) 35%,transparent)}`,
    `input,textarea{font-size:max(16px,1em)}`,
    // v1: on a field the focus ring sits on the edge itself, not a second box outside it; a link's underline turns accent under the pointer.
    `input:focus-visible,textarea:focus-visible,select:focus-visible{outline-offset:-1px}`,
    `[data-glyph]::before{content:attr(data-glyph)}`,
    // The rating: a native range input laid invisibly over the stars (v1 RatingField); its 22px thumb is half a star.
    `input.pz-range{position:absolute;inset:0;margin:0;width:100%;height:44px;cursor:pointer;opacity:0;-webkit-appearance:none;appearance:none;touch-action:manipulation}`,
    `input.pz-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px}`,
    `input.pz-range::-moz-range-thumb{width:22px;height:22px;border:0}`,
    `.pz-rating:has(input:focus-visible){outline:2px solid var(--c-focus);outline-offset:2px}`,
    `[data-link]:hover{text-decoration-color:var(--c-accent)!important}`,
    `.skip-link{position:absolute;left:8px;top:-100px;z-index:999;padding:12px 16px;background:var(--c-accent);color:var(--c-accentInk);font-family:${fonts.body600},system-ui,sans-serif}`,
    `.skip-link:focus{top:8px}`,
    // v1 globals.css keyframes: a panel unfolding from its button, the current tab's mark drawn across or down, a press, a skeleton.
    `@keyframes pausa-unfold{from{opacity:0;transform:translateY(-6px)}}`,
    `@keyframes pausa-mark-x{from{transform:scaleX(0)}}`,
    `@keyframes pausa-mark-y{from{transform:scaleY(0)}}`,
    `@keyframes pausa-draw{from{transform:scaleX(0)}}`,
    `@keyframes pausa-stand{from{opacity:.4;transform:scaleY(.5)}}`,
    `@keyframes pausa-pop{from{transform:scale(.9)}to{transform:none}}`,
    `@keyframes pausa-pulse{50%{opacity:.55}}`,
    `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}`,
  ].join("\n");
}

/** Renders the global CSS on web; nothing on native. */
export function ThemeStyle() {
  if (!isWeb) return null;
  return <style id="pausa-css" dangerouslySetInnerHTML={{ __html: globalCss() }} />;
}
