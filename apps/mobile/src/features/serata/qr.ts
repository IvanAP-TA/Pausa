import qrcode from "qrcode-generator";

/** A QR code as a boolean matrix (true = dark module). `qrcode-generator` is pure JavaScript (the same package v1 used in src/lib/qr.ts). */
export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const qr = qrcode(0, level); // type 0 = the smallest version that fits
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
