import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { getPollHead, getRoomView } from "@/lib/serata/server";

/**
 * Polling endpoint for the Serata room (~1.5 s). `?v=<version>` returns 204 when nothing changed,
 * so most polls cost one tiny D1 read. Only participants get the room; others get 403.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/serata/[code]">) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale");
  const locale = hasLocale(routing.locales, localeParam) ? localeParam : routing.defaultLocale;
  const since = Number(url.searchParams.get("v") ?? -1);

  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const head = await getPollHead(code, session.user.id);
  if (!head) return new Response(null, { status: 404 });
  if (!head.joined) return new Response(null, { status: 403 });
  if (head.version === since) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  const view = await getRoomView(code, session.user.id, locale);
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
