import { pauseMark } from "@/lib/pause-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return pauseMark(32, { inset: 0.22 });
}
