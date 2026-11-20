import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { getCircleForMember } from "@/lib/data";
import { loadCircleFacts } from "@/lib/core/insights";
import { rankTitles } from "@/lib/core/ranking";
import { recommendFast } from "@/lib/engine";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

/**
 * The side column of a Cerchia on wide screens: what to watch together (the recommendation engine) and the top of the
 * group's ranking. Asked by the page only when the screen is wide enough to show it, so phones never pay for it.
 * Members only: anyone else gets 404, like the Cerchia itself.
 */
export async function GET(request: Request, { params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  const localeParam = new URL(request.url).searchParams.get("locale") ?? "";
  const locale = hasLocale(routing.locales, localeParam) ? localeParam : routing.defaultLocale;
  const session = await getSession();
  if (!session || !(await getCircleForMember(circleId, session.user.id))) return new Response("Not found", { status: 404 });

  const { people, facts, watching } = await loadCircleFacts(await getDb(), circleId, locale);
  const [recs, top] = await Promise.all([
    recommendFast(facts, people, 4, watching),
    Promise.resolve(rankTitles(facts, people, { minVotes: people.length >= 3 ? 2 : 1, sort: "avg" }).slice(0, 5)),
  ]);
  return Response.json(
    {
      recs: recs.map((r) => ({ id: r.mediaId, title: r.title, posterPath: r.posterPath, kind: r.kind, year: r.year, score: r.score })),
      top: top.map((r) => ({ id: r.mediaId, title: r.title, posterPath: r.posterPath, avg: r.avg, votes: r.votes })),
    },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
