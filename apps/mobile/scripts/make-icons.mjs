// Generates the PWA / iOS icons from the Pausa mark (the film frame with the pause sign cut out of it: `PauseMark`, 28-unit grid).
//   node scripts/make-icons.mjs            writes public/icons/*.png
// No dependency: the mark is rectangles, so it is rasterised here (4x4 supersampling for the soft corners) and encoded with node:zlib.
// The colours are the sRGB copies of the dark tokens (tests/pwa.test.ts checks them against src/theme/tokens.ts).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PAPER = [0x00, 0x11, 0x13];
export const ACCENT = [0xfd, 0x7e, 0x49];

/** The sprocket holes and the two pause bars, in 28-unit coordinates: [x, y, w, h]. */
export const CUTS = [
  ...[3, 9.25, 15.5, 21.5].flatMap((y) => [[2.5, y, 3, 3.5], [22.5, y, 3, 3.5]]),
  [9.5, 7, 3.5, 14],
  [15, 7, 3.5, 14],
];

/**
 * RGBA pixels of one icon. `inset` is the share of the side left empty around the frame (0.21 for "any"; 0.34 keeps the mark inside
 * the 80% safe circle of a maskable icon), `rounded` rounds the paper square (not for iOS and maskable: the OS applies its own mask).
 */
export function render(size, { inset = 0.21, rounded = true } = {}) {
  const frame = size * (1 - inset * 2);
  const u = frame / 28;
  const off = (size - frame) / 2;
  const radius = rounded ? size * 0.22 : 0;
  const inside = (x, y) => {
    // rounded square of the whole icon
    if (!rounded) return true;
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!inside(x, y)) continue;
          let col = PAPER;
          if (x >= off && x < off + frame && y >= off && y < off + frame) {
            const gx = (x - off) / u;
            const gy = (y - off) / u;
            col = CUTS.some(([cx, cy, w, h]) => gx >= cx && gx < cx + w && gy >= cy && gy < cy + h) ? PAPER : ACCENT;
          }
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const cover = a / (255 * n);
      buf[i] = cover ? Math.round(r / (cover * n)) : 0;
      buf[i + 1] = cover ? Math.round(g / (cover * n)) : 0;
      buf[i + 2] = cover ? Math.round(b / (cover * n)) : 0;
      buf[i + 3] = Math.round(255 * cover);
    }
  return buf;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function encodePng(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** name -> [size, options]. iOS gets a square (it rounds it itself); maskable has the safe-zone padding. */
export const ICONS = {
  "icon-192.png": [192, {}],
  "icon-512.png": [512, {}],
  "maskable-512.png": [512, { inset: 0.34, rounded: false }],
  "apple-touch-icon.png": [180, { rounded: false }],
  "favicon-32.png": [32, { inset: 0.22 }],
};

export function writeIcons(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, [size, opts]] of Object.entries(ICONS)) fs.writeFileSync(path.join(dir, name), encodePng(size, render(size, opts)));
  return Object.keys(ICONS);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
  console.log(`wrote ${writeIcons(out).join(", ")} to ${out}`);
}
