import { CARD } from "@/lib/card-theme";

/** The ground of the launch screens: the app's print-black, so the launch does not flash. */
export const SPLASH_GROUND = CARD.paper;

/** iPhone and iPad launch screens (portrait): CSS pixels and device pixel ratio per model family. iOS picks the image whose media query matches. */
export const SPLASH_SCREENS = [
  { w: 430, h: 932, r: 3 }, // iPhone 14/15/16 Pro Max, 15/16 Plus
  { w: 393, h: 852, r: 3 }, // iPhone 14/15/16 Pro, 15/16
  { w: 428, h: 926, r: 3 }, // iPhone 12/13/14 Pro Max, 14 Plus
  { w: 390, h: 844, r: 3 }, // iPhone 12/13/14, 12/13 Pro
  { w: 375, h: 812, r: 3 }, // iPhone X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, r: 2 }, // iPhone XR, 11
  { w: 375, h: 667, r: 2 }, // iPhone 8, SE
  { w: 1024, h: 1366, r: 2 }, // iPad Pro 12.9"
  { w: 834, h: 1194, r: 2 }, // iPad Pro 11"
  { w: 820, h: 1180, r: 2 }, // iPad Air
] as const;

export const splashSize = (s: (typeof SPLASH_SCREENS)[number]) => `${s.w * s.r}x${s.h * s.r}`;

export const splashLinks = SPLASH_SCREENS.map((s) => ({
  url: `/apple-splash/${splashSize(s)}`,
  media: `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`,
}));
