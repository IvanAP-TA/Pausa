import { ImageResponse } from "next/og";
import { pauseBars } from "@/lib/pause-mark";
import { SPLASH_GROUND, SPLASH_SCREENS, splashSize } from "@/lib/splash";

/** Launch screen for iOS: print-black ground, the pause mark, nothing else. Only the sizes in SPLASH_SCREENS exist. */
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
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: SPLASH_GROUND }}>
        {pauseBars(bar, mark, Math.round(bar * 0.9))}
      </div>
    ),
    { width: w, height: h, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
