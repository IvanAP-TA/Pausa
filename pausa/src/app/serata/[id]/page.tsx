import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { getDb } from "@/db";
import { circles } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth";
import { getSerataState, tallyTavolo, bracketPairs } from "@/modules/serata";
import { LivePoll } from "@/ui/components/LivePoll";
import { ResultCard } from "@/ui/components/ResultCard";
import { joinSerataAction, voteSerataAction, closeSerataAction } from "@/app/_actions";

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w185";

export default async function SerataRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(env().DB);
  const state = await getSerataState(db, id);
  if (!state) notFound();

  const { serata, candidates, participants, votes } = state;
  const circle = serata.circleId
    ? await db.select().from(circles).where(eq(circles.id, serata.circleId)).get()
    : null;
  const user = await getCurrentUser();
  const store = await cookies();
  const pid = store.get(`pid_${id}`)?.value ?? null;
  const joined = pid && participants.some((p) => p.id === pid);

  // --- Result ---
  if (serata.status === "done") {
    const winner = candidates.find((c) => c.media.id === serata.winnerMediaId)?.media;
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        {winner ? (
          <ResultCard title={winner.title} year={winner.year} posterPath={winner.posterPath} circleName={circle?.name} />
        ) : (
          <p className="text-center text-ink-dim">Nessun vincitore.</p>
        )}
        {serata.circleId && (
          <div className="mt-8 text-center">
            <Link href={`/circles/${serata.circleId}`} className="text-mandarin hover:underline">Torna al diario</Link>
          </div>
        )}
      </main>
    );
  }

  // --- Join (guest-first) ---
  if (!joined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6">
        <div>
          <p className="font-display text-xl text-ink">Pausa</p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink">Entra nella Serata</h1>
          <p className="mt-2 text-ink-dim">Scegliete insieme cosa guardare. Basta un nome.</p>
        </div>
        <form action={joinSerataAction} className="flex gap-2">
          <input type="hidden" name="serataId" value={id} />
          <input
            name="guestName"
            defaultValue={user?.name ?? ""}
            placeholder="Il tuo nome"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-4 py-3 text-ink placeholder:text-ink-dim"
          />
          <button className="shrink-0 rounded-md bg-mandarin px-5 py-3 font-medium text-black">Entra</button>
        </form>
      </main>
    );
  }

  const tally = tallyTavolo(votes.map((v) => ({ mediaEntityId: v.mediaEntityId, kind: v.kind })), candidates.map((c) => c.media.id));
  const isCreator = user?.id === serata.createdBy;
  const candidateById = new Map(candidates.map((c) => [c.media.id, c.media]));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <LivePoll />
      <div className="mb-6 flex items-center justify-between gap-4">
        <span className="font-display text-xl text-ink">Pausa · Serata</span>
        <span className="text-sm text-ink-dim">{participants.length} in sala</span>
      </div>
      <h1 className="mb-8 font-display text-4xl font-semibold tracking-tight text-ink">
        {serata.mode === "bracket" ? "Torneo lampo" : "Il tavolo"}
      </h1>

      {serata.mode === "tavolo" ? (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {candidates.map(({ media }) => {
            const vetoed = tally.vetoed.includes(media.id);
            return (
              <li key={media.id} className={`space-y-2 ${vetoed ? "opacity-40" : ""}`}>
                <div className="overflow-hidden rounded-md border border-line bg-surface-1">
                  {media.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${IMG}${media.posterPath}`} alt={media.title} className="aspect-[2/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-ink-dim">{media.title}</div>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{media.title}</span>
                  <span className="text-forest">{tally.scores[media.id] ?? 0}</span>
                </div>
                <div className="flex gap-2">
                  <form action={voteSerataAction} className="flex-1">
                    <input type="hidden" name="serataId" value={id} />
                    <input type="hidden" name="mediaId" value={media.id} />
                    <input type="hidden" name="kind" value="dot" />
                    <button disabled={vetoed} className="w-full rounded-md bg-surface-2 px-2 py-1.5 text-sm text-ink hover:border-ink-dim disabled:opacity-50">Voto</button>
                  </form>
                  <form action={voteSerataAction}>
                    <input type="hidden" name="serataId" value={id} />
                    <input type="hidden" name="mediaId" value={media.id} />
                    <input type="hidden" name="kind" value="veto" />
                    <button className="rounded-md border border-line px-2 py-1.5 text-sm text-ink-dim hover:text-ink" title="Veto">⛔</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-5">
          {bracketPairs(candidates.map((c) => c.media.id)).map((pair, i) => (
            <li key={i} className="grid grid-cols-2 gap-4">
              {pair.map((mid, j) =>
                mid ? (
                  <form action={voteSerataAction} key={j} className="group">
                    <input type="hidden" name="serataId" value={id} />
                    <input type="hidden" name="mediaId" value={mid} />
                    <input type="hidden" name="kind" value="pick" />
                    <button className="block w-full overflow-hidden rounded-md border border-line transition hover:border-mandarin">
                      {candidateById.get(mid)?.posterPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${IMG}${candidateById.get(mid)!.posterPath}`} alt="" className="aspect-[2/3] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-ink-dim">{candidateById.get(mid)?.title}</div>
                      )}
                      <span className="block p-2 text-sm text-ink">{candidateById.get(mid)?.title}</span>
                    </button>
                  </form>
                ) : (
                  <div key={j} className="flex items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-dim">bye</div>
                ),
              )}
            </li>
          ))}
        </ul>
      )}

      {isCreator && (
        <form action={closeSerataAction} className="mt-10">
          <input type="hidden" name="serataId" value={id} />
          <button className="rounded-md bg-mandarin px-6 py-3 font-medium text-black">Chiudi e decidi</button>
        </form>
      )}
    </main>
  );
}
