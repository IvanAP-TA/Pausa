import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { getDb } from "@/db";
import { circles, circleMembers, logEntries, mediaEntities, users } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth";
import { tasteSimilarity, recommend, aggregate, type RatingRow } from "@/modules/recs";
import { MOCK_CATALOG } from "@/modules/tmdb/mock";

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w185";
const TYPE_LABEL: Record<string, string> = { movie: "Film", tv: "Serie", anime: "Anime" };

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const db = getDb(env().DB);

  const circle = await db.select().from(circles).where(eq(circles.id, id)).get();
  if (!circle) redirect("/circles");
  const membership = await db
    .select()
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, id), eq(circleMembers.userId, user.id)))
    .get();
  if (!membership) redirect("/circles");

  const members = await db
    .select({ u: users })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(eq(circleMembers.circleId, id))
    .all();
  const names: Record<string, string> = {};
  for (const m of members) names[m.u.id] = m.u.name;

  const logs = await db
    .select({ log: logEntries, media: mediaEntities })
    .from(logEntries)
    .innerJoin(mediaEntities, eq(mediaEntities.id, logEntries.mediaEntityId))
    .where(eq(logEntries.circleId, id))
    .all();

  const stats = aggregate(
    logs.map((l) => ({ userId: l.log.userId, rating: l.log.rating, type: l.media.type })),
    names,
  );

  const ratingsByUser: Record<string, RatingRow[]> = {};
  for (const l of logs) {
    (ratingsByUser[l.log.userId] ??= []).push({
      userId: l.log.userId,
      mediaId: l.media.id,
      rating: l.log.rating,
    });
  }

  const pairs: { a: string; b: string; sim: number | null }[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i].u.id;
      const b = members[j].u.id;
      pairs.push({ a, b, sim: tasteSimilarity(ratingsByUser[a] ?? [], ratingsByUser[b] ?? []) });
    }
  }

  const loggedTmdb = new Set(logs.map((l) => l.media.tmdbId));
  const recs = recommend(
    MOCK_CATALOG.map((c) => ({ tmdbId: c.id, title: c.title, posterPath: c.poster_path, type: c.type })),
    loggedTmdb,
    6,
  );

  const topRated = [...logs].filter((l) => l.log.rating != null).sort((a, b) => (b.log.rating! - a.log.rating!))[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href={`/circles/${id}`} className="text-sm text-ink-dim hover:text-ink">Torna al diario</Link>
      <h1 className="mb-8 mt-3 font-display text-5xl font-semibold tracking-tight text-ink">{circle.name} · Insight</h1>

      {/* Year in Review */}
      <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat big={String(stats.total)} label="titoli" />
        <Stat big={stats.avg ? stats.avg.toFixed(1) : "–"} label="voto medio" />
        <Stat big={stats.mostActive?.name ?? "–"} label="più attivo" />
        <Stat big={topRated ? topRated.media.title : "–"} label="top" />
      </section>

      {/* Confronto gusti */}
      {pairs.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-ink">Quanto vi somigliate</h2>
          <ul className="space-y-2">
            {pairs.map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 text-ink">{names[p.a]} · {names[p.b]}</span>
                {p.sim == null ? (
                  <span className="flex-1 text-ink-dim">nessun titolo in comune ancora</span>
                ) : (
                  <>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-forest" style={{ width: `${Math.round(p.sim * 100)}%` }} />
                    </span>
                    <span className="w-12 text-right text-ink-dim">{Math.round(p.sim * 100)}%</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Consigli di gruppo */}
      <section className="mb-12">
        <h2 className="mb-1 font-display text-xl text-ink">Da vedere, secondo i vostri gusti</h2>
        <p className="mb-4 text-sm text-ink-dim">Titoli che non avete ancora segnato nel diario.</p>
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {recs.map((r) => (
            <li key={r.tmdbId} className="space-y-1">
              <div className="overflow-hidden rounded-md border border-line bg-surface-1">
                {r.posterPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${IMG}${r.posterPath}`} alt={r.title} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center p-1 text-center text-[10px] text-ink-dim">{r.title}</div>
                )}
              </div>
              <p className="text-xs text-ink-dim">{TYPE_LABEL[r.type]}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Streaming in comune (mock) */}
      <section>
        <h2 className="mb-1 font-display text-xl text-ink">Dove potete vederli</h2>
        <p className="mb-3 text-sm text-ink-dim">Piattaforme in comune nella Cerchia (demo).</p>
        <ul className="flex flex-wrap gap-2">
          {["Netflix", "Prime Video", "Disney+"].map((p) => (
            <li key={p} className="rounded-md border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink">{p}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-4">
      <p className="truncate font-display text-2xl text-ink">{big}</p>
      <p className="text-sm text-ink-dim">{label}</p>
    </div>
  );
}
