import qrcode from "qrcode-generator";

/** QR code as a plain boolean matrix (true = dark module). Pure JavaScript, so it runs on Workers. */
export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const qr = qrcode(0, level); // type 0 = pick the smallest version that fits
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** A standalone SVG (one path), with a 2-module quiet zone, for <img src="data:..."> or inline use. */
export function qrSvg(text: string, opts: { dark?: string; light?: string; level?: "L" | "M" | "Q" | "H" } = {}): string {
  const { dark = "#151413", light = "#FFFFFF", level = "M" } = opts;
  const m = qrMatrix(text, level);
  const quiet = 2;
  const size = m.length + quiet * 2;
  let d = "";
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      let run = 1;
      while (c + run < row.length && row[c + run]) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

export const qrDataUri = (text: string, opts?: Parameters<typeof qrSvg>[1]) => `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(text, opts))}`;
