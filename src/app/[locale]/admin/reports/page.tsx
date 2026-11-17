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
    <main className="projector mx-auto grid max-w-2xl gap-6 px-5 py-12">
      <h1 className="font-display text-[2rem] leading-tight">Segnalazioni</h1>
      {open.length === 0 ? <p className="text-muted">Nessuna segnalazione aperta.</p> : (
        <ul className="grid gap-3">
          {open.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-md border border-rule bg-paper-2 p-4">
              <p className="text-xs text-muted">{r.kind === "comment" ? "Commento" : "Visione"} · {REASON[r.reason]} · da {r.reporter ?? "utente eliminato"}{r.circleName ? ` · ${r.circleName}` : ""}</p>
              <p className="text-[15px] [overflow-wrap:anywhere]">{r.excerpt ?? "(contenuto non più disponibile)"}</p>
              {r.note && <p className="text-sm text-muted">Nota: {r.note}</p>}
              <div className="flex gap-2">
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="remove" />
                  <button className="min-h-10 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">Rimuovi il contenuto</button></form>
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="dismiss" />
                  <button className="min-h-10 rounded-full border border-rule px-4 text-sm hover:bg-paper-3">Ignora</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm text-muted">Chiuse di recente</h2>
          <ul className="grid gap-1 text-sm text-muted">
            {done.map((r) => <li key={r.id}>{r.resolution === "removed" ? "Rimosso" : "Ignorata"}: {r.excerpt ?? "—"}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
