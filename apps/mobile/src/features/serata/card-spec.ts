/**
 * The result card, drawn on the device (PLAN 1.4: no image rendering in the Worker). One layout, in "design units" (the story is 1080 wide),
 * read by two renderers: the React Native `CardView` (preview on screen, and the view that react-native-view-shot captures on Android and
 * iOS) and the canvas drawing used on web. Everything here is plain numbers and strings so it can be tested without a screen.
 */

export type Variant = "story" | "og";
export const SIZES: Record<Variant, { w: number; h: number }> = { story: { w: 1080, h: 1920 }, og: { w: 1200, h: 630 } };

export type Rect = { x: number; y: number; w: number; h: number };

export type CardLayout = {
  w: number;
  h: number;
  poster: Rect;
  wordmark: { x: number; y: number; size: number };
  kicker: { x: number; y: number; size: number; width: number };
  title: { x: number; y: number; width: number; maxLines: number; align: "left" | "center" };
  meta: { x: number; y: number; size: number; width: number };
  qr: Rect;
  qrCaption: { x: number; y: number; size: number; width: number } | null;
};

export function cardLayout(variant: Variant): CardLayout {
  if (variant === "story") {
    return {
      w: 1080, h: 1920,
      // v1's one-sheet: the print runs edge to edge at the top, then the title in hairline capitals, the facts, the wordmark and the code.
      poster: { x: 0, y: 0, w: 1080, h: 1060 },
      wordmark: { x: 72, y: 1636, size: 52 },
      kicker: { x: 72, y: 1096, size: 36, width: 936 },
      title: { x: 72, y: 1150, width: 936, maxLines: 2, align: "left" },
      meta: { x: 72, y: 1520, size: 38, width: 936 },
      qr: { x: 72, y: 1716, w: 168, h: 168 },
      qrCaption: { x: 272, y: 1770, size: 36, width: 736 },
    };
  }
  return {
    w: 1200, h: 630,
    poster: { x: 0, y: 0, w: 420, h: 630 },
    wordmark: { x: 480, y: 48, size: 48 },
    kicker: { x: 480, y: 128, size: 30, width: 660 },
    title: { x: 480, y: 176, width: 660, maxLines: 3, align: "left" },
    meta: { x: 480, y: 452, size: 32, width: 520 },
    qr: { x: 1032, y: 462, w: 120, h: 120 },
    qrCaption: null,
  };
}

/** Title size by length, as in v1 (shorter titles get bigger type), scaled to the layouts above. */
export function titleSize(variant: Variant, title: string): number {
  const n = [...title].length;
  if (variant === "story") return n <= 13 ? 170 : n <= 34 ? 130 : 100;
  return n <= 12 ? 132 : n <= 30 ? 100 : 76;
}

/** Cheap average advance of an uppercase Sofia Sans Extra Condensed glyph, in em. The canvas renderer measures for real instead. */
const EM_PER_CHAR = 0.4;
export const guessWidth = (text: string, size: number) => [...text].length * size * EM_PER_CHAR;

/** Greedy word wrap into at most `maxLines`; the last line is cut with an ellipsis if the title still does not fit. */
export function wrapLines(text: string, maxWidth: number, size: number, maxLines: number, measure: (s: string, size: number) => number = guessWidth): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
  while (last.length > 1 && measure(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Dark modules as horizontal runs `[row, col, length]` (the quiet zone is added by the renderer): few rectangles instead of one per module. */
export function qrRuns(matrix: boolean[][]): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      let len = 1;
      while (c + len < row.length && row[c + len]) len++;
      runs.push([r, c, len]);
      c += len;
    }
  });
  return runs;
}

/** The poster box has a 2:3 shape: this is where the artwork goes when it has to be cropped ("cover"). */
export function coverCrop(imgW: number, imgH: number, box: { w: number; h: number }) {
  const scale = Math.max(box.w / imgW, box.h / imgH);
  const sw = box.w / scale;
  const sh = box.h / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}
