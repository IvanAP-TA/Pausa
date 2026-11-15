import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { getDb } from "@/db";
import { logEntries, mediaEntities } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth";
import { createSerataAction } from "@/app/_actions";

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w185";

export default async function NewSerataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const db = getDb(env().DB);

  const rows = await db
    .select({ media: mediaEntities })
    .from(logEntries)
    .innerJoin(mediaEntities, eq(mediaEntities.id, logEntries.mediaEntityId))
    .where(eq(logEntries.circleId, id))
    .all();
  const seen = new Map<string, (typeof rows)[number]["media"]>();
  for (const r of rows) seen.set(r.media.id, r.media);
  const films = [...seen.values()];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href={`/circles/${id}`} className="text-sm text-ink-dim hover:text-ink">Torna al diario</Link>
      <h1 className="mb-3 mt-3 font-display text-5xl font-semibold tracking-tight text-ink">La Serata</h1>
      <p className="mb-8 text-ink-dim">Scegli fino a 8 titoli dalla rosa e la modalità. Poi condividi il link: chiunque vota, anche senza account.</p>

      {films.length < 2 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="text-ink">Servono almeno 2 film nel diario.</p>
          <Link href={`/circles/${id}/log`} className="mt-2 inline-block text-mandarin hover:underline">Logga qualche film</Link>
        </div>
      ) : (
        <form action={createSerataAction} className="space-y-8">
          <input type="hidden" name="circleId" value={id} />

          <fieldset>
            <legend className="mb-3 font-display text-lg text-ink">Modalità</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-lg border border-line bg-surface-1 p-4 has-[:checked]:border-mandarin">
                <input type="radio" name="mode" value="bracket" defaultChecked className="mr-2 accent-mandarin" />
                <span className="font-medium text-ink">Bracket</span>
                <p className="mt-1 text-sm text-ink-dim">Torneo lampo a eliminazione, 1 contro 1.</p>
              </label>
              <label className="cursor-pointer rounded-lg border border-line bg-surface-1 p-4 has-[:checked]:border-mandarin">
                <input type="radio" name="mode" value="tavolo" className="mr-2 accent-mandarin" />
                <span className="font-medium text-ink">Tavolo</span>
                <p className="mt-1 text-sm text-ink-dim">Voto a punti + un veto d&apos;emergenza a testa.</p>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 font-display text-lg text-ink">La rosa</legend>
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {films.map((m) => (
                <li key={m.id}>
                  <label className="group block cursor-pointer">
                    <input type="checkbox" name="mediaId" value={m.id} className="peer sr-only" />
                    <div className="overflow-hidden rounded-md border border-line opacity-60 transition peer-checked:border-mandarin peer-checked:opacity-100">
                      {m.posterPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${IMG}${m.posterPath}`} alt={m.title} className="aspect-[2/3] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-ink-dim">{m.title}</div>
                      )}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <button className="rounded-md bg-mandarin px-6 py-3 font-medium text-black">Crea la Serata</button>
        </form>
      )}
    </main>
  );
}
