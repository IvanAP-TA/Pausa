import { ImageResponse } from "next/og";
import { CARD } from "@/lib/card-theme";

/** The two bars on their own, for the cards and the launch screens: amber, square-cornered. */
export function pauseBars(bar: number, height: number, gap: number) {
  return (
    <div style={{ display: "flex", gap }}>
      <div style={{ width: bar, height, background: CARD.accent }} />
      <div style={{ width: bar, height, background: CARD.accent }} />
    </div>
  );
}

/** Pausa app mark: a frame of film in the signal colour, sprocket holes down both edges, the pause sign cut out of it, on the dark ground. `inset` leaves room for maskable crops. */
export function pauseMark(size: number, { inset = 0.21, rounded = true } = {}) {
  const frame = Math.round(size * (1 - inset * 2));
  const u = frame / 28; // the mark is drawn on a 28-unit square, as in `PauseMark`
  const cut = (x: number, y: number, w: number, h: number) => (
    <div key={`${x}-${y}`} style={{ position: "absolute", left: x * u, top: y * u, width: w * u, height: h * u, background: CARD.paper }} />
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: CARD.paper,
          borderRadius: rounded ? Math.round(size * 0.22) : 0,
        }}
      >
        <div style={{ position: "relative", display: "flex", width: frame, height: frame, background: CARD.accent }}>
          {[3, 9.25, 15.5, 21.5].flatMap((y) => [cut(2.5, y, 3, 3.5), cut(22.5, y, 3, 3.5)])}
          {cut(9.5, 7, 3.5, 14)}
          {cut(15, 7, 3.5, 14)}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
