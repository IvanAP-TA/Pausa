import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth";
import { isMockMode } from "@/env";
import { MOCK_CATALOG } from "@/modules/tmdb/mock";

export const dynamic = "force-dynamic";

const IMG = "https://image.tmdb.org/t/p/w342";
const STACK = [MOCK_CATALOG[2], MOCK_CATALOG[0], MOCK_CATALOG[6], MOCK_CATALOG[11]];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/circles");
  const sp = await searchParams;
  const mock = isMockMode();

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
      {/* Hero copy + entry */}
      <section className="max-w-xl">
        <p className="rise font-display text-2xl text-ink">Pausa</p>

        <h1 className="rise mt-8 font-display text-6xl font-semibold leading-[0.95] tracking-tight text-ink sm:text-7xl">
          Quello che guardate,
          <br />
          insieme.
        </h1>

        <p className="rise-2 mt-6 max-w-md text-lg leading-relaxed text-ink-dim">
          Il diario privato della tua Cerchia. Segnate film, voti e serate — e
          decidete cosa guardare senza litigare. Niente pubblico, solo voi.
        </p>

        <div className="rise-3 mt-10 max-w-sm space-y-4">
          {sp.sent && (
            <p className="rounded-md border border-forest/50 bg-forest/10 px-4 py-3 text-sm text-ink">
              Ti abbiamo mandato un link d&apos;accesso. Controlla la mail.
            </p>
          )}
          {sp.error && (
            <p className="rounded-md border border-line bg-surface-1 px-4 py-3 text-sm text-ink-dim">
              Qualcosa non ha funzionato. Riprova.
            </p>
          )}

          {mock && (
            <form action="/api/auth/dev" method="post" className="flex gap-2">
              <input
                name="name"
                placeholder="Il tuo nome"
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-4 py-3 text-ink placeholder:text-ink-dim"
              />
              <button className="shrink-0 rounded-md bg-mandarin px-5 py-3 font-medium text-black">
                Entra
              </button>
            </form>
          )}

          {!mock && (
            <>
              <Link
                href="/api/auth/google"
                className="block rounded-md bg-mandarin px-5 py-3 text-center font-medium text-black"
              >
                Continua con Google
              </Link>
              <form action="/api/auth/magic" method="post" className="flex gap-2">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="tua@email.com"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-4 py-3 text-ink placeholder:text-ink-dim"
                />
                <button className="shrink-0 rounded-md border border-line bg-surface-2 px-5 py-3 font-medium text-ink">
                  Link
                </button>
              </form>
            </>
          )}
          {mock && (
            <p className="text-sm text-ink-dim">
              Modalità demo — entra con un nome, nessuna password.
            </p>
          )}
        </div>
      </section>

      {/* Signature: la pila dei film visti */}
      <section aria-hidden className="relative hidden h-[30rem] lg:block">
        <div
          className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-2/60 blur-3xl"
        />
        {STACK.map((m, i) => (
          <div
            key={m.id}
            className="absolute left-1/2 top-1/2 w-56 overflow-hidden rounded-lg border border-line shadow-2xl shadow-black/40"
            style={{
              transform: `translate(-50%,-50%) translateX(${(i - 1.5) * 42}px) rotate(${(i - 1.5) * 4}deg)`,
              zIndex: i,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}${m.poster_path}`} alt="" className="aspect-[2/3] w-full object-cover" />
          </div>
        ))}
      </section>
    </main>
  );
}
