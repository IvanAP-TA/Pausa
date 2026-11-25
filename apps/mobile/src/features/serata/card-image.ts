import type { Ref } from "react";
import type { HostInstance } from "react-native";
import { fonts } from "@/theme";
import { CARD, QUIET, type CardData } from "./CardView";
import { cardLayout, coverCrop, qrRuns, SIZES, titleSize, wrapLines, type Variant } from "./card-spec";
import { posterUrl } from "@/ui/MediaPoster";

/** Web: the PNG is drawn on a canvas from the shared layout (PLAN 1.4: "canvas on web"), then shared or downloaded. */
export type ExportOutcome = "shared" | "downloaded" | "cancelled";
export type ExportInput = { variant: Variant; data: CardData; viewRef?: Ref<HostInstance>; /** true = only save, never open a share sheet */ saveOnly?: boolean; fileName: string };

const fontReady = async (spec: string) => {
  try {
    await document.fonts.load(spec);
  } catch {
    // a missing font falls back to the system one; the card still draws
  }
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // TMDB sends CORS headers; without them the canvas would be tainted and unreadable
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 6000);
  });

/** Draws the card and returns it as a PNG blob. Exported for the tests in the browser. */
export async function drawCard(variant: Variant, data: CardData): Promise<Blob> {
  const L = cardLayout(variant);
  const { w, h } = SIZES[variant];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  const display200 = `200 100px "${fonts.display200}"`;
  const display400 = `400 100px "${fonts.display400}"`;
  const body400 = `400 30px "${fonts.body400}"`;
  const body600 = `600 30px "${fonts.body600}"`;
  const url = posterUrl(data.posterPath, "w500");
  const [, , , , img] = await Promise.all([fontReady(display200), fontReady(display400), fontReady(body400), fontReady(body600), url ? loadImage(url) : Promise.resolve(null)]);

  ctx.fillStyle = CARD.ground;
  ctx.fillRect(0, 0, w, h);

  // poster, "cover" in its 2:3 box; without artwork a dye block with the initials, like MediaPoster
  const p = L.poster;
  if (img) {
    const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, p);
    ctx.drawImage(img, sx, sy, sw, sh, p.x, p.y, p.w, p.h);
  } else {
    ctx.fillStyle = "#1d4750";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#e9e4d8";
    ctx.font = `400 ${p.w * 0.4}px "${fonts.display400}", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const initials = data.title.trim().split(/\s+/).slice(0, 2).map((x) => x[0] ?? "").join("").toLocaleUpperCase(data.locale);
    ctx.fillText(initials, p.x + p.w / 2, p.y + p.h / 2);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const text = (s: string, x: number, y: number, font: string, color: string, spacing = 0) => {
    ctx.font = font;
    ctx.fillStyle = color;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    ctx.fillText(s, x, y);
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  };
  text("PAUSA", L.wordmark.x, L.wordmark.y, `400 ${L.wordmark.size}px "${fonts.display400}", sans-serif`, CARD.accent, 2);
  text(data.kicker.toLocaleUpperCase(data.locale), L.kicker.x, L.kicker.y, `600 ${L.kicker.size}px "${fonts.body600}", sans-serif`, CARD.muted, 3);

  const size = titleSize(variant, data.title);
  const titleFont = `200 ${size}px "${fonts.display200}", sans-serif`;
  ctx.font = titleFont;
  const lines = wrapLines(data.title.toLocaleUpperCase(data.locale), L.title.width, size, L.title.maxLines, (s) => {
    ctx.font = titleFont;
    return ctx.measureText(s).width;
  });
  lines.forEach((line, i) => text(line, L.title.x, L.title.y + i * size * 1.02, titleFont, CARD.ink));
  const metaFont = `400 ${L.meta.size}px "${fonts.body400}", sans-serif`;
  const metaLines = wrapLines(data.meta, L.meta.width, L.meta.size, 2, (s) => {
    ctx.font = metaFont;
    return ctx.measureText(s).width;
  });
  metaLines.forEach((line, i) => text(line, L.meta.x, L.meta.y + i * L.meta.size * 1.3, metaFont, CARD.muted));

  // QR: light square with its quiet zone, dark runs
  ctx.fillStyle = CARD.qrLight;
  ctx.fillRect(L.qr.x, L.qr.y, L.qr.w, L.qr.h);
  const unit = L.qr.w / (data.qr.length + QUIET * 2);
  ctx.fillStyle = CARD.qrDark;
  for (const [r, c, len] of qrRuns(data.qr)) ctx.fillRect(L.qr.x + (c + QUIET) * unit, L.qr.y + (r + QUIET) * unit, len * unit + 0.5, unit + 0.5);
  if (L.qrCaption) text(data.caption, L.qrCaption.x, L.qrCaption.y, `400 ${L.qrCaption.size}px "${fonts.body400}", sans-serif`, CARD.ink);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Share through the system sheet when the browser can share files (phones), else download the PNG. */
export async function exportCard({ variant, data, saveOnly, fileName }: ExportInput): Promise<ExportOutcome> {
  const blob = await drawCard(variant, data);
  const file = new File([blob], fileName, { type: "image/png" });
  if (!saveOnly && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: data.title });
      return "shared";
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return "cancelled";
    }
  }
  download(blob, fileName);
  return "downloaded";
}
