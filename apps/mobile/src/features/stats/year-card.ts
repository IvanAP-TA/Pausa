// Web: the "my year" image is drawn with the Canvas 2D API (PLAN 1.4: canvas on web, react-native-view-shot on native).
// react-native-view-shot on web needs html2canvas-pro, which is not installed and would add ~200 KB; drawing four lines of text
// does not need a DOM screenshotter. The numbers and sentences come in already translated, so both platforms show the same card.
import { palettes, fonts } from "@/theme";

import type { ShareOutcome, YearCard } from "./year-card-types";

const W = 1080;
const H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Draws the card on a canvas (exported for tests and for the preview). */
export async function drawYearCard(card: YearCard): Promise<HTMLCanvasElement> {
  const c = palettes.dark;
  await Promise.all([`400 120px "${fonts.display400}"`, `200 120px "${fonts.display200}"`, `400 40px "${fonts.body400}"`].map((f) => document.fonts.load(f).catch(() => undefined)));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = c.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.accent;
  ctx.fillRect(80, 80, 120, 8);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.ink2;
  ctx.font = `400 44px "${fonts.display400}", sans-serif`;
  ctx.fillText(card.kicker.toUpperCase(), 80, 160);
  ctx.fillStyle = c.ink;
  ctx.font = `200 190px "${fonts.display200}", sans-serif`;
  let y = 360;
  for (const l of wrap(ctx, card.headline.toUpperCase(), W - 160)) {
    ctx.fillText(l, 80, y);
    y += 190;
  }
  ctx.font = `400 56px "${fonts.display400}", sans-serif`;
  y += 20;
  for (const s of card.stats) {
    ctx.fillStyle = c.ink;
    ctx.fillText(s.toUpperCase(), 80, y);
    y += 80;
  }
  if (card.best) {
    y += 40;
    ctx.fillStyle = c.accent;
    ctx.font = `400 40px "${fonts.display400}", sans-serif`;
    ctx.fillText(card.best.label.toUpperCase(), 80, y);
    y += 80;
    ctx.fillStyle = c.ink;
    ctx.font = `400 72px "${fonts.display400}", sans-serif`;
    for (const l of wrap(ctx, card.best.title.toUpperCase(), W - 160).slice(0, 2)) {
      ctx.fillText(l, 80, y);
      y += 80;
    }
  }
  ctx.fillStyle = c.ink2;
  ctx.font = `400 36px "${fonts.body400}", sans-serif`;
  y += 30;
  for (const e of card.extra) {
    for (const l of wrap(ctx, e, W - 160)) {
      ctx.fillText(l, 80, y);
      y += 48;
    }
  }
  ctx.fillStyle = c.accent;
  ctx.font = `400 64px "${fonts.display400}", sans-serif`;
  ctx.fillText(card.brand.toUpperCase(), 80, H - 80);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas empty"))), "image/png"));

/** The system share sheet when the browser can share a file (phones), else a download. */
export async function shareYearCard(card: YearCard, _view?: unknown): Promise<ShareOutcome> {
  const blob = await toBlob(await drawYearCard(card));
  const file = new File([blob], card.fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: card.shareText });
      return "shared";
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "shared"; // the person closed the sheet: nothing to report
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = card.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}
