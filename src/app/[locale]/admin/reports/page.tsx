import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import { openReports, recentlyResolved } from "@/lib/core/moderation";
import { resolveReportAction } from "@/lib/manage-actions";

export const metadata = { title: "Segnalazioni", robots: { index: false } };

const REASON = { spam: "Spam", abuse: "Abuso", privacy: "Privacy", other: "Altro" } as const;

/** Operator-only list of open reports. Anyone else gets a 404. */
export default async function Reports({ params }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous || !isOperator(session.user.email)) notFound();
  const db = await getDb();
  const [open, done] = await Promise.all([openReports(db), recentlyResolved(db)]);

  return (
    <main className="projector mx-auto grid max-w-2xl gap-8 px-4 py-12">
      <h1 className="display">Segnalazioni</h1>
      {open.length === 0 ? <p className="well grained p-6 text-ink-2">Nessuna segnalazione aperta.</p> : (
        <ul className="rows grid">
          {open.map((r) => (
            <li key={r.id} className="grid gap-3 py-5">
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="tag">{r.kind === "comment" ? "Commento" : "Visione"}</span>
                <span className="tag">{REASON[r.reason]}</span>
                <span>da {r.reporter ?? "utente eliminato"}{r.circleName ? `, ${r.circleName}` : ""}</span>
              </p>
              <p className="[overflow-wrap:anywhere]">{r.excerpt ?? "(contenuto non più disponibile)"}</p>
              {r.note && <p className="text-sm text-muted [overflow-wrap:anywhere]">Nota: {r.note}</p>}
              <div className="flex flex-wrap gap-2">
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="remove" />
                  <button className="btn btn-quiet text-error">Rimuovi il contenuto</button></form>
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="dismiss" />
                  <button className="btn btn-quiet">Ignora</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section className="grid gap-3">
          <h2 className="title">Chiuse di recente</h2>
          <ul className="rows grid">
            {done.map((r) => (
              <li key={r.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-3 text-sm">
                <span className="text-ink-2">{r.resolution === "removed" ? "Rimosso" : "Ignorata"}</span>
                <span className="text-muted [overflow-wrap:anywhere]">{r.excerpt ?? "(contenuto non più disponibile)"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
