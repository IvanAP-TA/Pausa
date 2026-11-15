import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { env } from "@/env";
import { getDb } from "@/db";
import { circles, circleMembers, invites, logEntries, mediaEntities, users, comments } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth";
import { listNowWatching } from "@/modules/now-watching";
import { StarRating } from "@/ui/components/StarRating";
import { SpoilerText } from "@/ui/components/SpoilerText";
import {
  commentAction,
  createInviteAction,
  reactAction,
  setNowWatchingAction,
  clearNowWatchingAction,
  importAction,
} from "@/app/_actions";

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w185";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
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

  const logs = await db
    .select({ log: logEntries, media: mediaEntities, author: users })
    .from(logEntries)
    .innerJoin(mediaEntities, eq(mediaEntities.id, logEntries.mediaEntityId))
    .innerJoin(users, eq(users.id, logEntries.userId))
    .where(eq(logEntries.circleId, id))
    .orderBy(desc(logEntries.createdAt))
    .all();

  const logIds = logs.map((l) => l.log.id);
  const allComments = logIds.length
    ? await db
        .select({ c: comments, author: users })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.userId))
        .where(inArray(comments.logId, logIds))
        .all()
    : [];

  const circleInvites =
    membership.role === "admin"
      ? await db.select().from(invites).where(eq(invites.circleId, id)).all()
      : [];

  const watching = await listNowWatching(db, id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-10 flex items-center justify-between gap-4">
        <Link href="/circles" className="text-sm text-ink-dim hover:text-ink">
          Le Cerchie
        </Link>
        <nav className="flex items-center gap-5 text-sm text-ink-dim">
          <Link href="/lists" className="hover:text-ink">Liste</Link>
          <Link href="/notifications" className="hover:text-ink">Notifiche</Link>
        </nav>
      </div>

      <header className="mb-8">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-ink">{circle.name}</h1>
        <p className="mt-2 text-ink-dim">
          {logs.length === 0 ? "Diario vuoto" : `${logs.length} ${logs.length === 1 ? "film" : "film"} nel diario`}
        </p>
      </header>

      <div className="mb-10 flex flex-wrap items-center gap-4">
        <Link
          href={`/circles/${id}/log`}
          className="inline-flex rounded-md bg-mandarin px-5 py-2.5 font-medium text-black"
        >
          Logga un film
        </Link>
        <Link
          href={`/circles/${id}/serata/new`}
          className="inline-flex rounded-md border border-line bg-surface-2 px-5 py-2.5 font-medium text-ink hover:border-ink-dim"
        >
          Organizza una Serata
        </Link>
        <Link
          href={`/circles/${id}/insights`}
          className="inline-flex rounded-md border border-line bg-surface-2 px-5 py-2.5 font-medium text-ink hover:border-ink-dim"
        >
          Insight
        </Link>
      </div>

      <div className="mb-10 flex flex-wrap items-center gap-3 text-sm text-ink-dim">
        <span>Importa il tuo storico:</span>
        <form action={importAction}>
          <input type="hidden" name="circleId" value={id} />
          <input type="hidden" name="source" value="letterboxd" />
          <button className="rounded-md border border-line px-3 py-1.5 hover:text-ink">Letterboxd</button>
        </form>
        <form action={importAction}>
          <input type="hidden" name="circleId" value={id} />
          <input type="hidden" name="source" value="anilist" />
          <button className="rounded-md border border-line px-3 py-1.5 hover:text-ink">AniList</button>
        </form>
      </div>

      {watching.length > 0 && (
        <section className="mb-10 rounded-lg border border-forest/40 bg-forest/10 p-4">
          <h2 className="mb-2 text-sm text-ink-dim">Sto guardando</h2>
          <ul className="flex flex-wrap gap-4">
            {watching.map((w) => (
              <li key={w.row.id} className="flex items-center gap-2 text-sm text-ink">
                <span className="text-ink">{w.user.name}</span>
                <span className="text-ink-dim">·</span>
                <span>{w.media.title}</span>
                {w.user.id === user.id && (
                  <form action={clearNowWatchingAction}>
                    <input type="hidden" name="circleId" value={id} />
                    <button className="text-xs text-ink-dim hover:text-ink">(ho finito)</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {membership.role === "admin" && (
        <section className="mb-10 rounded-lg border border-line bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-ink">Inviti</h2>
              <p className="text-sm text-ink-dim">Condividi un codice per far entrare qualcuno.</p>
            </div>
            <form action={createInviteAction}>
              <input type="hidden" name="circleId" value={id} />
              <button className="rounded-md border border-line bg-surface-2 px-4 py-2 text-sm text-ink hover:border-ink-dim">
                Genera codice
              </button>
            </form>
          </div>
          {circleInvites.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {circleInvites.map((inv) => (
                <li key={inv.id} className="rounded-md bg-base px-3 py-1.5 font-mono text-sm tracking-wider text-forest">
                  {inv.code}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          <p className="text-ink">Ancora nessun film.</p>
          <p className="mt-1 text-sm text-ink-dim">Logga il primo e il diario comincia.</p>
        </div>
      ) : (
        <ul className="space-y-10">
          {logs.map(({ log, media, author }) => (
            <li key={log.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-5">
              <div className="overflow-hidden rounded-md border border-line bg-surface-1">
                {media.posterPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${IMG}${media.posterPath}`} alt={media.title} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-ink-dim">
                    {media.title}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="font-display text-xl text-ink">
                    {media.title}
                    {media.year ? <span className="text-ink-dim"> {media.year}</span> : null}
                  </h3>
                  <StarRating rating={log.rating} />
                </div>

                <p className="text-sm text-ink-dim">
                  <span className="text-ink">{author.name}</span> l&apos;ha guardato
                  {log.platform ? ` su ${log.platform}` : ""}
                </p>

                <div className="flex items-center gap-2">
                  {["❤️", "🔥"].map((emoji) => (
                    <form action={reactAction} key={emoji}>
                      <input type="hidden" name="circleId" value={id} />
                      <input type="hidden" name="targetId" value={log.id} />
                      <input type="hidden" name="emoji" value={emoji} />
                      <button className="rounded-full border border-line px-3 py-1 text-sm hover:border-ink-dim">
                        {emoji}
                      </button>
                    </form>
                  ))}
                  <form action={setNowWatchingAction}>
                    <input type="hidden" name="circleId" value={id} />
                    <input type="hidden" name="mediaEntityId" value={media.id} />
                    <button className="rounded-full border border-line px-3 py-1 text-sm text-ink-dim hover:text-ink">
                      Sto guardando
                    </button>
                  </form>
                </div>

                <ul className="space-y-1.5">
                  {allComments
                    .filter((c) => c.c.logId === log.id)
                    .map(({ c, author: ca }) => (
                      <li key={c.id} className="text-sm leading-relaxed">
                        <span className="text-ink-dim">{ca.name}: </span>
                        <SpoilerText body={c.body} isSpoiler={c.isSpoiler} />
                      </li>
                    ))}
                </ul>

                <form action={commentAction} className="flex flex-wrap items-center gap-2 pt-1">
                  <input type="hidden" name="circleId" value={id} />
                  <input type="hidden" name="logId" value={log.id} />
                  <input
                    name="body"
                    placeholder="Scrivi un commento…"
                    className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-dim"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                    <input type="checkbox" name="isSpoiler" /> spoiler
                  </label>
                  <button className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink hover:border-ink-dim">
                    Invia
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-16 border-t border-line pt-6 text-xs text-ink-dim">
        Dati e locandine forniti da TMDB. Questo prodotto non è approvato da TMDB.
      </footer>
    </main>
  );
}
