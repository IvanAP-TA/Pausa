import { ImageResponse } from "next/og";
import { SPLASH_SCREENS, splashSize } from "@/lib/splash";

/** Launch screen for iOS: paper background, the pause mark, nothing else. Only the sizes in SPLASH_SCREENS exist. */
export async function GET(_req: Request, ctx: RouteContext<"/apple-splash/[size]">) {
  const { size } = await ctx.params;
  const screen = SPLASH_SCREENS.find((s) => splashSize(s) === size);
  if (!screen) return new Response("Not found", { status: 404 });
  const w = screen.w * screen.r;
  const h = screen.h * screen.r;
  const mark = Math.round(Math.min(w, h) * 0.22);
  const bar = Math.round(mark * 0.2);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2EEE5" }}>
        <div style={{ display: "flex", gap: Math.round(bar * 0.9) }}>
          <div style={{ width: bar, height: mark, background: "#C9361F", borderRadius: Math.round(bar / 3) }} />
          <div style={{ width: bar, height: mark, background: "#C9361F", borderRadius: Math.round(bar / 3) }} />
        </div>
      </div>
    ),
    { width: w, height: h, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
