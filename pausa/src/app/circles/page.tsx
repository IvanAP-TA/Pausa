import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getDb } from "@/db";
import { getCurrentUser } from "@/modules/auth";
import { listCirclesForUser } from "@/modules/circles";
import { createCircleAction, joinAction, logoutAction } from "@/app/_actions";

export const dynamic = "force-dynamic";

export default async function CirclesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const db = getDb(env().DB);
  const circles = await listCirclesForUser(db, user.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-12 flex items-center justify-between gap-4">
        <span className="font-display text-xl text-ink">Pausa</span>
        <nav className="flex items-center gap-5 text-sm text-ink-dim">
          <Link href="/lists" className="hover:text-ink">Liste</Link>
          <Link href="/notifications" className="hover:text-ink">Notifiche</Link>
          <form action={logoutAction}>
            <button className="hover:text-ink">Esci</button>
          </form>
        </nav>
      </div>

      <header className="mb-8">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-ink">
          Ciao {user.name}.
        </h1>
        <p className="mt-2 text-ink-dim">Le Cerchie di cui fai parte.</p>
      </header>

      {circles.length === 0 ? (
        <div className="mb-12 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="text-ink">Non sei ancora in nessuna Cerchia.</p>
          <p className="mt-1 text-sm text-ink-dim">Creane una, o entra con un codice invito.</p>
        </div>
      ) : (
        <ul className="mb-12 grid gap-3 sm:grid-cols-2">
          {circles.map((c) => (
            <li key={c.id}>
              <Link
                href={`/circles/${c.id}`}
                className="block rounded-lg border border-line bg-surface-1 p-5 transition-colors hover:border-ink-dim"
              >
                <span className="font-display text-xl text-ink">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={createCircleAction} className="space-y-3 rounded-lg border border-line bg-surface-1 p-5">
          <h2 className="font-display text-lg text-ink">Crea una Cerchia</h2>
          <input
            name="name"
            required
            placeholder="Es. Cineclub del venerdì"
            className="w-full rounded-md border border-line bg-base px-3 py-2.5 text-ink placeholder:text-ink-dim"
          />
          <button className="w-full rounded-md bg-mandarin px-3 py-2.5 font-medium text-black">
            Crea
          </button>
        </form>

        <form action={joinAction} className="space-y-3 rounded-lg border border-line bg-surface-1 p-5">
          <h2 className="font-display text-lg text-ink">Entra con un codice</h2>
          <input
            name="code"
            required
            placeholder="Codice invito"
            className="w-full rounded-md border border-line bg-base px-3 py-2.5 font-mono uppercase tracking-wider text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-dim"
          />
          <button className="w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 font-medium text-ink hover:border-ink-dim">
            Entra
          </button>
        </form>
      </div>
    </main>
  );
}
