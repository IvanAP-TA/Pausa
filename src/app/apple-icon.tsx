import { pauseMark } from "@/lib/pause-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own corner mask: ship a square.
export default function AppleIcon() {
  return pauseMark(180, { rounded: false });
}
