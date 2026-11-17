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

/** Pausa app mark: an amber pause sign on print-black. `inset` leaves room for maskable crops. */
export function pauseMark(size: number, { inset = 0.28, rounded = true } = {}) {
  const bar = Math.round(size * 0.12);
  const gap = Math.round(size * 0.1);
  const height = Math.round(size * (1 - inset * 2));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap,
          background: CARD.paper,
          borderRadius: rounded ? Math.round(size * 0.22) : 0,
        }}
      >
        <div style={{ width: bar, height, background: CARD.accent }} />
        <div style={{ width: bar, height, background: CARD.accent }} />
      </div>
    ),
    { width: size, height: size },
  );
}
