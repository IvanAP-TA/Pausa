import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { getDb } from "@/db";
import { lists } from "@/db/schema";
import { getCurrentUser } from "@/modules/auth";
import { createListAction } from "@/app/_actions";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const db = getDb(env().DB);

  const personal = await db.select().from(lists).where(eq(lists.ownerUserId, user.id)).all();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-ink">Liste</h1>
        <Link href="/circles" className="text-sm text-ink-dim hover:text-ink">← Cerchie</Link>
      </div>

      <h2 className="mb-3 font-display text-lg text-ink">Personali</h2>
      {personal.length === 0 ? (
        <p className="mb-6 text-ink-dim">Nessuna lista personale.</p>
      ) : (
        <ul className="mb-6 grid gap-2">
          {personal.map((l) => (
            <li key={l.id} className="rounded-lg border border-line bg-surface-1 px-4 py-3 text-ink">
              {l.name}
            </li>
          ))}
        </ul>
      )}

      <form action={createListAction} className="space-y-3 rounded-lg border border-line bg-surface-1 p-4">
        <h2 className="font-display text-lg text-ink">Nuova lista personale</h2>
        <input type="hidden" name="scope" value="personal" />
        <input
          name="name"
          required
          placeholder="Nome lista"
          className="w-full rounded-md border border-line bg-base px-3 py-2 text-ink placeholder:text-ink-dim focus:outline-none"
        />
        <button className="w-full rounded-md bg-mandarin px-3 py-2 font-medium text-black transition hover:opacity-90">
          Crea
        </button>
      </form>
    </main>
  );
}
