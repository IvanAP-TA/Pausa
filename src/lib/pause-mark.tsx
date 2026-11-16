import { ImageResponse } from "next/og";

/** Pausa app mark: a paper-coloured pause sign on tomato. `inset` leaves room for maskable crops. */
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
          background: "#C9361F",
          borderRadius: rounded ? Math.round(size * 0.22) : 0,
        }}
      >
        <div style={{ width: bar, height, background: "#F2EEE5", borderRadius: Math.round(bar / 3) }} />
        <div style={{ width: bar, height, background: "#F2EEE5", borderRadius: Math.round(bar / 3) }} />
      </div>
    ),
    { width: size, height: size },
  );
}
