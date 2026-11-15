import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getCurrentUser } from "@/modules/auth";
import { searchMedia } from "@/modules/tmdb";
import { logFilmAction } from "@/app/_actions";

const TYPE_LABEL: Record<string, string> = { movie: "Film", tv: "Serie", anime: "Anime" };

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w342";
const RATINGS = ["", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];

export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const results = q ? await searchMedia(env().TMDB_API_KEY, q) : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href={`/circles/${id}`} className="text-sm text-ink-dim hover:text-ink">
        Torna al diario
      </Link>

      <h1 className="mb-8 mt-3 font-display text-5xl font-semibold tracking-tight text-ink">
        Cosa avete visto?
      </h1>

      <form method="get" className="mb-10 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          autoFocus
          placeholder="Cerca film, serie o anime…"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-4 py-3 text-ink placeholder:text-ink-dim"
        />
        <button className="shrink-0 rounded-md bg-mandarin px-5 py-3 font-medium text-black">
          Cerca
        </button>
      </form>

      {q && results.length === 0 && (
        <p className="text-ink-dim">Nessun risultato per “{q}”.</p>
      )}

      <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
        {results.map((m) => {
          const year = m.release_date ? m.release_date.slice(0, 4) : null;
          return (
            <li key={m.id} className="space-y-3">
              <div className="overflow-hidden rounded-md border border-line bg-surface-1">
                {m.poster_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${IMG}${m.poster_path}`} alt={m.title} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-ink-dim">
                    {m.title}
                  </div>
                )}
              </div>
              <div>
                <p className="font-display text-sm leading-tight text-ink">{m.title}</p>
                <p className="text-xs text-ink-dim">
                  {TYPE_LABEL[m.type]}{year ? ` · ${year}` : ""}
                </p>
              </div>
              <form action={logFilmAction} className="space-y-2">
                <input type="hidden" name="circleId" value={id} />
                <input type="hidden" name="tmdbId" value={m.id} />
                <select
                  name="rating"
                  defaultValue=""
                  className="w-full rounded-md border border-line bg-surface-1 px-2 py-1.5 text-sm text-ink"
                >
                  {RATINGS.map((r) => (
                    <option key={r} value={r}>{r === "" ? "Voto…" : `${r} ★`}</option>
                  ))}
                </select>
                <input
                  name="platform"
                  placeholder="Piattaforma"
                  className="w-full rounded-md border border-line bg-surface-1 px-2 py-1.5 text-sm text-ink placeholder:text-ink-dim"
                />
                <button className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm font-medium text-ink hover:border-ink-dim">
                  Aggiungi al diario
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
