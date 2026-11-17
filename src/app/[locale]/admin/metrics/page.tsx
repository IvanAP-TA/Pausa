import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { computeMetrics } from "@/lib/core/metrics";
import { isOperator } from "@/lib/operator";

export const metadata = { title: "Metriche", robots: { index: false } };

const pct = (v: number | null) => (v === null ? "n.d." : `${Math.round(v * 100)}%`);
const num = (v: number | null, digits = 1) => (v === null ? "n.d." : v.toFixed(digits));

/** Operator-only dashboard of the early success metrics (master prompt §10). Anyone else gets a 404. */
export default async function Metrics({ params }: PageProps<"/[locale]/admin/metrics">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous || !isOperator(session.user.email)) notFound();
  const m = await computeMetrics(await getDb());

  const rows: { label: string; value: string; note: string }[] = [
    { label: "Cerchia entro 7 giorni dall'iscrizione", value: pct(m.circleWithin7d.rate), note: `${m.circleWithin7d.cohort} persone iscritte da almeno 7 giorni` },
    { label: "Visioni per Cerchia attiva a settimana", value: num(m.logsPerActiveCircleWeek), note: "ultime 4 settimane, Cerchie con almeno una visione" },
    { label: "Cerchie che usano le liste", value: pct(m.circlesUsingLists.rate), note: `${m.circlesUsingLists.circles} Cerchie, liste di gruppo` },
    { label: "Serata: tempo mediano al risultato", value: m.serataTime.medianSeconds === null ? "n.d." : `${Math.round(m.serataTime.medianSeconds)} s`, note: `obiettivo sotto 120 s; ${pct(m.serataTime.under120)} sotto 120 s su ${m.serataTime.finished} concluse` },
    { label: "Serate con Card condivisa", value: pct(m.serataShared.cardRate), note: `link d'invito condiviso: ${pct(m.serataShared.inviteRate)}, su ${m.serataShared.finished} concluse` },
    { label: "Retention Cerchie a 7 giorni", value: pct(m.retention.d7.rate), note: `${m.retention.d7.eligible} Cerchie abbastanza vecchie` },
    { label: "Retention Cerchie a 30 giorni", value: pct(m.retention.d30.rate), note: `${m.retention.d30.eligible} Cerchie abbastanza vecchie` },
    { label: "Persone che usano «Sto guardando»", value: pct(m.nowWatchingAdoption.rate), note: `su ${m.nowWatchingAdoption.people} persone in una Cerchia` },
  ];

  return (
    <main className="projector mx-auto grid max-w-2xl gap-8 px-4 py-12">
      <header className="grid gap-5">
        <h1 className="display">Metriche</h1>
        {/* The totals: four figures on one line, each over its label. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {([
            [m.totals.users, "persone"], [m.totals.circles, "Cerchie"], [m.totals.logs, "visioni"], [m.totals.serate, "Serate"],
          ] as const).map(([value, label]) => (
            <div key={label} className="plate grid gap-1 pt-3">
              <dt className="row-start-2 text-sm text-muted">{label}</dt>
              <dd className="figure row-start-1 text-display">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="tabular text-sm text-muted">calcolate il {m.generatedAt.toLocaleString(locale)}</p>
      </header>
      <dl className="rows grid">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
            <dt>{r.label}</dt>
            <dd className="figure text-display sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:text-right">{r.value}</dd>
            <dd className="text-sm text-muted">{r.note}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">«n.d.» significa che non ci sono ancora dati sufficienti, non che il valore è zero.</p>
    </main>
  );
}
