import { pauseMark } from "@/lib/pause-mark";

/** Manifest icons: /pwa-icon/192, /pwa-icon/512, /pwa-icon/maskable (512, safe-zone padding). */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[variant]">) {
  const { variant } = await ctx.params;
  if (variant === "192") return pauseMark(192);
  if (variant === "512") return pauseMark(512);
  if (variant === "maskable") return pauseMark(512, { inset: 0.34, rounded: false });
  return new Response("Not found", { status: 404 });
}
